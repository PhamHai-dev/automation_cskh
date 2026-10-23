
  /** CS chỉ được thao tác trên config của chính mình. */
  private assertCanAccess(cfg: { cs_user_id: number }, actorId?: number, actorRoles?: string[]): void {
    if (!actorId) return;
    const roles = actorRoles || [];
    if (roles.includes('ADMIN') || roles.includes('MANAGE')) return;
    if (roles.includes('CS') && cfg.cs_user_id !== actorId) {
      throw new AppError(
        403,
        'Cấu hình sao lưu này không thuộc phạm vi dữ liệu của tài khoản CSKH đang đăng nhập.'
      );
    }
  }

  /**
   * Backup điểm danh cho ĐÚNG MỘT config (CSKH x chương trình).
   */
  public async runBackupForConfig(
    configId: number,
    opts: { forceFullRewrite?: boolean; year?: number | null; actorId?: number; actorRoles?: string[] } = {}
  ): Promise<ProgramBackupSummary> {
    await this.ensureConfigs();

    const config = await prisma.programSheetBackupConfig.findUnique({
      where: { id: configId },
      include: { cs_user: { select: { id: true, name: true, email: true, staff_code: true } } },
    });
    if (!config) {
      throw new AppError(404, `Không tìm thấy cấu hình sao lưu điểm danh (ID=${configId})`);
    }
    this.assertCanAccess(config, opts.actorId, opts.actorRoles);

    const programType = normalizeProgramType(config.program_type);
    const sheetName = config.sheet_name || this.defaultSheetNameFor(programType);
    const headerRow = config.header_row || 2;
    const staffCode = config.cs_user?.staff_code || null;
    const relBackupPath =
      config.local_backup_path ||
      this.relativeBackupPathFor(staffCode || `CS${config.cs_user_id}`, programType);
    const absBackupPath = this.resolveLocalBackupPath(relBackupPath);

    // opts.year (override) > config.backup_year > null = mọi năm
    const yearFilter =
      opts.year === undefined || opts.year === null ? (config.backup_year ?? null) : Number(opts.year);

    await prisma.programSheetBackupConfig.update({
      where: { id: config.id },
      data: { last_status: 'RUNNING', last_error: null },
    });

    try {
      const enrollments = await loadEnrollments(config.cs_user_id, programType);
      const months = this.scopedMonths(enrollments, yearFilter);

      const prepared = await this.prepareWorkbook(
        absBackupPath,
        sheetName,
        headerRow,
        months,
        Boolean(opts.forceFullRewrite)
      );
      const ws = prepared.worksheet;
      const sampleRowNumber = prepared.firstDataRow;

      // Chỉ block nằm trong scope năm được ghi; block khác giữ nguyên ô.
      const blockByMonth = new Map<string, AttendanceMonthBlock>();
      for (const b of prepared.blocks) blockByMonth.set(`${b.year}-${b.month}`, b);
      const scopedBlocks: AttendanceMonthBlock[] = [];
      for (const m of months) {
        const b = blockByMonth.get(`${m.year}-${m.month}`);
        if (b) scopedBlocks.push(b);
      }

      const { rowByKey, rowByExternalId } = this.indexSheetRows(ws, headerRow);
      let maxRow = ws.rowCount > headerRow ? ws.rowCount : headerRow;
      for (const r of rowByKey.values()) maxRow = Math.max(maxRow, r);

      const stats = {
        totalStudents: enrollments.length,
        unchangedRows: 0,
        updatedRows: 0,
        appendedRows: 0,
        updatedCellsCount: 0,
        attendanceCellsWritten: 0,
      };
      const batchRanges: Array<{ range: string; values: (string | number)[][] }> = [];

      for (const enr of enrollments) {
        const externalId = String(
          enr.student?.external_id || enr.external_id || `HV${enr.student_id}`
        ).trim();
        const activeEc =
          enr.enrollment_classes.find((ec) => ec.status === 'ACTIVE') ||
          enr.enrollment_classes[enr.enrollment_classes.length - 1] ||
          null;
        const cls = activeEc?.class || null;
        const classCode = String(cls?.class_code || cls?.class_name || '').trim();
        const startDateKey = dateKeyUtc(enr.start_date);
        const key = this.rowKey(externalId, classCode, startDateKey);

        // Ưu tiên khớp đủ 3 thành phần khoá; nếu chưa có thì tái sử dụng dòng
        // cùng externalId mà chưa bị enrolment khác chiếm.
        let targetRow = rowByKey.get(key);
        if (targetRow === undefined) {
          const candidates = (rowByExternalId.get(externalId.toUpperCase()) || []).filter(
            (r) => !this.rowOccupiedByOtherKey(rowByKey, r, externalId, classCode, startDateKey)
          );
          targetRow = candidates[0];
        }
        const isNewRow = targetRow === undefined;
        if (isNewRow) targetRow = ++maxRow;

        const row = ws.getRow(targetRow);

        const allAttendances = (enr.enrollment_classes || []).flatMap((ec) => ec.attendance || []);
        const attendanceByDate = new Map<string, (typeof allAttendances)[number]>();
        for (const att of allAttendances) {
          const dayKey = dateKeyUtc(att.class_session?.session_date);
          if (!dayKey) continue;
          attendanceByDate.set(dayKey, att);
        }

        const teacherCodes = Array.from(
          new Set(
            (cls?.class_teachers || [])
              .filter((ct) => ct.active)
              .map((ct) => String(ct.teacher?.code || '').trim())
              .filter(Boolean)
          )
        );
        const schedule =
          (cls?.class_schedules || []).find((sc) => sc.active) || (cls?.class_schedules || [])[0] || null;

        const values: Array<{ col: number; value: string | number }> = [
          { col: ATTENDANCE_COLS.classCode, value: classCode },
          { col: ATTENDANCE_COLS.externalId, value: externalId },
          { col: ATTENDANCE_COLS.fullName, value: enr.student?.full_name || '' },
          { col: ATTENDANCE_COLS.status, value: this.formatStatusLabel(enr.status) },
          { col: ATTENDANCE_COLS.startTime, value: schedule?.start_time || '' },
          { col: ATTENDANCE_COLS.cvht, value: staffCode || config.cs_user?.name || '' },
          { col: ATTENDANCE_COLS.schedulePattern, value: schedule?.schedule_pattern || '' },
          { col: ATTENDANCE_COLS.durationMinutes, value: schedule?.duration_minutes ?? '' },
          { col: ATTENDANCE_COLS.teacherCode, value: teacherCodes.join('/') },
          { col: ATTENDANCE_COLS.totalSessions, value: enr.total_sessions ?? '' },
          { col: START_DATE_COL, value: startDateKey },
        ];

        // Cột ngày + 6 cột tổng kết, CHỈ trong block thuộc scope.
        for (const block of scopedBlocks) {
          const counters: Record<string, number> = {
            attended: 0,
            absentA: 0,
            leaveB: 0,
            absentC: 0,
            teacherD: 0,
            techErrorE: 0,
          };
          for (const dayCol of block.dailyCols) {
            const att = attendanceByDate.get(dayCol.date) || null;
            const value = this.attendanceCellValue(att);
            values.push({ col: dayCol.colNumber, value });
            if (value !== '') {
              stats.attendanceCellsWritten++;
              if (value === 'A') counters.absentA++;
              else if (value === 'B') counters.leaveB++;
              else if (value === 'C') counters.absentC++;
              else if (value === 'D') counters.teacherD++;
              else if (value === 'E') counters.techErrorE++;
              else counters.attended++;
            }
          }
          const summaryEntries: Array<[keyof AttendanceSummaryCols, number]> = [
            ['attended', counters.attended],
            ['absentA', counters.absentA],
            ['leaveB', counters.leaveB],
            ['absentC', counters.absentC],
            ['teacherD', counters.teacherD],
            ['techErrorE', counters.techErrorE],
          ];
          for (const [skey, count] of summaryEntries) {
            const col = block.summaryCols[skey];
            if (!col) continue;
            values.push({ col, value: count });
          }
        }

        // Cột L "Số buổi đã học": Google/Excel không còn sheet nguồn (Setting,
        // 'Điểm học tập') trong file backup -> ghi con số chốt theo năm đang backup.
        if (yearFilter !== null) {
          values.push({
            col: ATTENDANCE_COLS.attendedTotal,
            value: this.attendedInYear(enr, yearFilter),
          });
        }

        if (isNewRow) this.copyFormulaRow(ws, sampleRowNumber, targetRow, prepared.lastCol);

        let rowChanged = 0;
        for (const item of values) {
          const cell = row.getCell(item.col);
          const desiredStr = normalizeCellComparable(item.value);
          const currentStr = isNewRow ? '' : normalizeCellComparable(cell.value);
          if (currentStr === desiredStr) continue;
          if (isNewRow) {
            if (desiredStr !== '') cell.value = item.value;
          } else {
            setCellValuePreservingFormula(cell, item.value);
          }
          rowChanged++;
        }

        if (isNewRow) {
          rowByKey.set(key, targetRow);
          const list = rowByExternalId.get(externalId.toUpperCase()) || [];
          list.push(targetRow);
          rowByExternalId.set(externalId.toUpperCase(), list);
          stats.appendedRows++;
          stats.updatedCellsCount += rowChanged;
        } else if (rowChanged > 0) {
          stats.updatedRows++;
          stats.updatedCellsCount += rowChanged;
        } else {
          stats.unchangedRows++;
          continue; // dòng không đổi -> không push range
        }

        const lastBlock = scopedBlocks[scopedBlocks.length - 1] || null;
        const summaryColsOfLast = lastBlock
          ? (Object.values(lastBlock.summaryCols).filter((x): x is number => typeof x === 'number') as number[])
          : [];
        const colEnd = Math.max(
          FIXED_LAST_COL,
          lastBlock ? lastBlock.endCol : 0,
          ...summaryColsOfLast
        );

        const rowData: (string | number)[] = [];
        for (let c = 1; c <= colEnd; c++) {
          const raw = row.getCell(c).value as any;
          if (raw && typeof raw === 'object' && 'formula' in raw) {
            const result = raw.result;
            rowData.push(result === undefined || result === null ? '' : (result as string | number));
          } else if (raw instanceof Date) {
            rowData.push(dateKeyLocal(raw));
          } else {
            rowData.push(raw === null || raw === undefined ? '' : (raw as string | number));
          }
        }
        batchRanges.push({
          range: `'${sheetName}'!A${targetRow}:${colNumberToLetter(colEnd)}${targetRow}`,
          values: [rowData],
        });
      }

      // 4. Ghi file local
      const backupDir = path.dirname(absBackupPath);
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      await prepared.workbook.xlsx.writeFile(absBackupPath);

      // 5. Push Google Sheet (nếu có đích)
      let syncedToGoogleSheet = false;
      const targetSpreadsheetId =
        config.target_spreadsheet_id ||
        this.sheetSyncService.extractSpreadsheetId(config.target_spreadsheet_url);

      if (targetSpreadsheetId) {
        const auth = await this.sheetSyncService.getAuthorizedAccessToken();
        if (!auth) {
          throw new AppError(
            400,
            'Đã cấu hình Google Sheet đích nhưng chưa cấu hình Google Service Account JSON để ghi dữ liệu.'
          );
        }
        await verifyTargetSpreadsheetSecurity(targetSpreadsheetId, auth.accessToken, config.require_private_sheet);
        if (batchRanges.length > 0) {
          await pushDeltaToGoogleSheet(targetSpreadsheetId, auth.accessToken, batchRanges);
        }
        syncedToGoogleSheet = true;
      }

      const now = new Date();
      const summary: ProgramBackupSummary = {
        csUserId: config.cs_user_id,
        staffCode,
        programType,
        status: 'SUCCESS',
        syncedToGoogleSheet,
        localFilePath: relBackupPath.replace(/\\/g, '/'),
        totalStudents: stats.totalStudents,
        unchangedRows: stats.unchangedRows,
        updatedRows: stats.updatedRows,
        appendedRows: stats.appendedRows,
        updatedCellsCount: stats.updatedCellsCount,
        attendanceCellsWritten: stats.attendanceCellsWritten,
        yearFilter,
        backedUpAt: now.toISOString(),
      };

      await prisma.programSheetBackupConfig.update({
        where: { id: config.id },
        data: {
          local_backup_path: relBackupPath.replace(/\\/g, '/'),
          last_backup_at: now,
          last_status: 'SUCCESS',
          last_summary: summary as unknown as Prisma.InputJsonValue,
          last_error: null,
        },
      });

      await prisma.auditLog
        .create({
          data: {
            user_id: opts.actorId || config.cs_user_id,
            action: 'CS_PROGRAM_BACKUP',
            entity_type: 'ProgramSheetBackupConfig',
            entity_id: String(config.id),
            after_data: summary as unknown as Prisma.InputJsonValue,
          },
        })
        .catch((err: any) => {
          log.warn('Không ghi được AuditLog CS_PROGRAM_BACKUP', { error: err?.message || String(err) });
        });

      const changedRows = stats.updatedRows + stats.appendedRows;
      if (changedRows > 0) {
        await prisma.importBatch
          .create({
            data: {
              uploaded_by_id: opts.actorId || config.cs_user_id,
              file_name: `[BACKUP-${staffCode || config.cs_user_id}-${programType}] ${path.basename(
                relBackupPath
              )}`,
              import_type: ImportType.GOOGLE_SHEET_BACKUP,
              total_rows: stats.totalStudents,
              success_rows: stats.totalStudents,
              failed_rows: 0,
              status: ImportBatchStatus.COMPLETED,
              completed_at: now,
            },
          })
          .catch(() => {});
      }

      return summary;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      await prisma.programSheetBackupConfig
        .update({ where: { id: config.id }, data: { last_status: 'FAILED', last_error: errMsg } })
        .catch(() => {});

      await prisma.auditLog
        .create({
          data: {
            user_id: opts.actorId || config.cs_user_id,
            action: 'CS_PROGRAM_BACKUP',
            entity_type: 'ProgramSheetBackupConfig',
            entity_id: String(config.id),
            after_data: {
              csUserId: config.cs_user_id,
              programType,
              status: 'FAILED',
              error: errMsg,
              failedAt: new Date().toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        })
        .catch(() => {});

      throw err;
    }
  }

  /**
   * True khi `rowNumber` đã bị một khoá KHÁC chiếm (classCode/startDate khác),
   * tức không được tái sử dụng cho enrollment đang xét.
   */
  private rowOccupiedByOtherKey(
    rowByKey: Map<string, number>,
    rowNumber: number,
    externalId: string,
    classCode: string,
    startDateKey: string
  ): boolean {
    const own = this.rowKey(externalId, classCode, startDateKey);
    for (const [key, r] of rowByKey.entries()) {
      if (r === rowNumber && key !== own) return true;
    }
    return false;
  }

  /** Chạy backup cho toàn bộ config enabled (lọc theo chương trình nếu có). */
  public async runAllBackups(opts: {
    forceFullRewrite?: boolean;
    year?: number | null;
    programType?: string | null;
  } = {}): Promise<{ results: ProgramBackupSummary[] }> {
    await this.ensureConfigs();

    const where: Prisma.ProgramSheetBackupConfigWhereInput = { enabled: true };
    const program = normalizeProgramType(opts.programType);
    if (program) where.program_type = program;

    const configs = await prisma.programSheetBackupConfig.findMany({
      where,
      orderBy: [{ cs_user_id: 'asc' }, { program_type: 'asc' }],
    });

    const results: ProgramBackupSummary[] = [];
    for (const cfg of configs) {
      try {
        results.push(
          await this.runBackupForConfig(cfg.id, {
            forceFullRewrite: opts.forceFullRewrite,
            year: opts.year,
          })
        );
      } catch (err: any) {
        log.warn('runAllBackups: một config thất bại, tiếp tục config còn lại', {
          configId: cfg.id,
          error: err?.message || String(err),
        });
      }
    }
    return { results };
  }

  /** Đường dẫn file backup để download; file chưa có -> chạy backup trước. */
  public async getBackupFilePath(
    configId: number,
    opts: { forceRefresh?: boolean; actorId?: number; actorRoles?: string[] } = {}
  ): Promise<{ absPath: string; fileName: string }> {
    await this.ensureConfigs();

    const config = await prisma.programSheetBackupConfig.findUnique({
      where: { id: configId },
      include: { cs_user: { select: { id: true, staff_code: true } } },
    });
    if (!config) {
      throw new AppError(404, `Không tìm thấy cấu hình sao lưu điểm danh (ID=${configId})`);
    }
    this.assertCanAccess(config, opts.actorId, opts.actorRoles);

    const programType = normalizeProgramType(config.program_type);
    const staffCode = config.cs_user?.staff_code || `CS${config.cs_user_id}`;
    const relPath = config.local_backup_path || this.relativeBackupPathFor(staffCode, programType);
    const absPath = this.resolveLocalBackupPath(relPath);

    if (opts.forceRefresh || !fs.existsSync(absPath)) {
      await this.runBackupForConfig(configId, {
        forceFullRewrite: false,
        actorId: opts.actorId,
        actorRoles: opts.actorRoles,
      });
    }

    return { absPath, fileName: path.basename(absPath) };
  }

  /**
   * Chạy các config tới đúng khung giờ (per-minute cron gọi). Debounce theo
   * last_backup_at trong cùng HH:mm + cùng ngày nên vẫn đúng sau restart.
   */
  public async processDueBackupConfigs(now = new Date()): Promise<void> {
    await this.ensureConfigs();

    const currentHm = `${this.pad2(now.getHours())}:${this.pad2(now.getMinutes())}`;
    const configs = await prisma.programSheetBackupConfig.findMany({ where: { enabled: true } });

    for (const cfg of configs) {
      const scheduleTimes =
        Array.isArray(cfg.schedule_times) && cfg.schedule_times.length > 0
          ? (cfg.schedule_times as string[]).map(String)
          : [...DEFAULT_SCHEDULE_TIMES];
      if (!scheduleTimes.includes(currentHm)) continue;

      if (cfg.last_backup_at) {
        const last = new Date(cfg.last_backup_at);
        const sameSlot =
          last.getFullYear() === now.getFullYear() &&
          last.getMonth() === now.getMonth() &&
          last.getDate() === now.getDate() &&
          this.pad2(last.getHours()) === this.pad2(now.getHours()) &&
          this.pad2(last.getMinutes()) === this.pad2(now.getMinutes());
        if (sameSlot) continue;
      }

      try {
        await this.runBackupForConfig(cfg.id, {
          forceFullRewrite: false,
          year: cfg.backup_year ?? null,
        });
      } catch (err: any) {
        log.warn('Scheduled attendance backup failed', {
          configId: cfg.id,
          error: err?.message || String(err),
        });
      }
    }
  }
}

const BACKUP_CRON_SCHEDULE = '* * * * *'; // mỗi phút so HH:mm local với schedule_times
let backupCronTask: ReturnType<typeof cron.schedule> | null = null;
let isBackupCycleRunning = false;
const schedulerService = new SheetBackupService();

export function startCsSheetBackupScheduler(): void {
  if (backupCronTask) {
    log.info('Attendance backup scheduler already running');
    return;
  }

  backupCronTask = cron.schedule(BACKUP_CRON_SCHEDULE, async () => {
    if (isBackupCycleRunning) return;
    isBackupCycleRunning = true;
    try {
      await schedulerService.processDueBackupConfigs(new Date());
    } catch (err: any) {
      log.error('Unexpected error in attendance backup scheduler', {
        error: err?.message || String(err),
      });
    } finally {
      isBackupCycleRunning = false;
    }
  });

  log.info(`Attendance backup scheduler started, schedule="${BACKUP_CRON_SCHEDULE}"`);
}

export function stopCsSheetBackupScheduler(): void {
  if (backupCronTask) {
    backupCronTask.stop();
    backupCronTask = null;
    log.info('Attendance backup scheduler stopped');
  }
}
