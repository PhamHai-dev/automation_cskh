/// <reference types="node" />
import path from 'path';
import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import {
  AttendanceSource,
  AttendanceStatus,
  ClassModelType,
  EnrollmentClassStatus,
  EnrollmentStatus,
  PrismaClient,
  TeacherType,
} from '@prisma/client';

const prisma = new PrismaClient();
const SOURCE_FILE = path.resolve(__dirname, '../../docs/data/cham_soc_hoc_vien.xlsx');
const ROW_LIMIT = 10;

type SourceRow = {
  rowNumber: number;
  values: Record<string, string>;
  attendance: Array<{ date: Date; value: string }>;
};

function cellText(cell: ExcelJS.Cell): string {
  let value: any = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('result' in value) value = value.result;
    else if ('text' in value) value = value.text;
    else if ('richText' in value) value = value.richText.map((part: any) => part.text).join('');
    else return '';
  }
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function detectHeaderRow(sheet: ExcelJS.Worksheet): number {
  const keywords = ['id', 'họ tên', 'gói học', 'trạng thái', 'tên lớp'];
  let bestRow = 1;
  let bestScore = -1;
  for (let rowNumber = 1; rowNumber <= Math.min(10, sheet.rowCount); rowNumber++) {
    let score = 0;
    sheet.getRow(rowNumber).eachCell((cell) => {
      const value = normalize(cellText(cell));
      if (keywords.some((keyword) => value.includes(keyword))) score++;
    });
    if (score > bestScore) {
      bestRow = rowNumber;
      bestScore = score;
    }
  }
  return bestRow;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const first = value.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  if (!first) return null;
  const iso = first.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const vietnamese = first.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (vietnamese) return new Date(Date.UTC(Number(vietnamese[3]), Number(vietnamese[2]) - 1, Number(vietnamese[1])));
  const parsed = new Date(first);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseHeaderDate(cell: ExcelJS.Cell): Date | null {
  if (cell.value instanceof Date && !Number.isNaN(cell.value.getTime())) return cell.value;
  return parseDate(cellText(cell));
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function enrollmentStatus(value?: string): EnrollmentStatus {
  const status = normalize(value || '');
  if (status.includes('bảo lưu')) return EnrollmentStatus.PAUSED;
  if (status.includes('kết thúc') || status.includes('hoàn thành')) return EnrollmentStatus.FINISHED;
  if (status.includes('chờ') || status.includes('sắp học') || status.includes('chưa học')) return EnrollmentStatus.NOT_STARTED;
  if (status.includes('hủy')) return EnrollmentStatus.CANCELLED;
  return EnrollmentStatus.STUDYING;
}

function classModel(value?: string): ClassModelType {
  const model = normalize(value || '');
  if (model.includes('1-2') || model.includes('1:2')) return ClassModelType.ONE_TO_TWO;
  if (model.includes('nhóm') || model.includes('1-n') || model.includes('1:n')) return ClassModelType.ONE_TO_N;
  return ClassModelType.ONE_TO_ONE;
}

function attendance(value: string): { status: AttendanceStatus; count: number } | null {
  const code = value.trim().toUpperCase();
  const statuses: Record<string, AttendanceStatus> = {
    A: AttendanceStatus.ABSENT_APPROVED_A,
    B: AttendanceStatus.LEAVE_B,
    C: AttendanceStatus.ABSENT_UNAPPROVED_C,
    D: AttendanceStatus.TEACHER_ABSENT_D,
    E: AttendanceStatus.TECH_ERROR_E,
  };
  if (statuses[code]) return { status: statuses[code], count: 1 };
  if (code === 'X' || code === 'ĐÃ HỌC') return { status: AttendanceStatus.ATTENDED, count: 1 };
  const count = Number(code.replace(',', '.'));
  return Number.isFinite(count) && count > 0
    ? { status: AttendanceStatus.ATTENDED, count }
    : null;
}

function readRows(sheet: ExcelJS.Worksheet, limit: number): SourceRow[] {
  const headerRowNumber = detectHeaderRow(sheet);
  const header = sheet.getRow(headerRowNumber);
  const columns: Array<{ number: number; title: string; date: Date | null }> = [];
  header.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    columns.push({ number: columnNumber, title: cellText(cell), date: parseHeaderDate(cell) });
  });

  const rows: SourceRow[] = [];
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount && rows.length < limit; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values: Record<string, string> = {};
    const attendanceValues: SourceRow['attendance'] = [];
    for (const column of columns) {
      const value = cellText(row.getCell(column.number));
      if (!value) continue;
      if (column.date) attendanceValues.push({ date: column.date, value });
      else if (column.title) values[normalize(column.title)] = value;
    }
    if (values.id && values['họ tên hv'] && values['gói học']) {
      rows.push({ rowNumber, values, attendance: attendanceValues });
    }
  }
  return rows;
}

function field(row: SourceRow, ...names: string[]): string {
  for (const name of names) {
    const value = row.values[normalize(name)];
    if (value) return value;
  }
  return '';
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((item) => item.trim()).find(Boolean) || '';
}

function timeValue(value: string): string | null {
  const match = firstLine(value).match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${(match[2] || '00').padStart(2, '0')}`;
}

async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'
  `;
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');
  try {
    for (const { TABLE_NAME } of tables) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${TABLE_NAME.replace(/`/g, '``')}\`;`);
    }
  } finally {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
  }
}

async function main() {
  console.log(`Đọc 10 dòng đầu từ ${SOURCE_FILE}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SOURCE_FILE);
  const careSheet = workbook.getWorksheet('1.Chăm sóc');
  const attendanceSheet = workbook.getWorksheet('3.Chấm buổi');
  if (!careSheet || !attendanceSheet) throw new Error('Thiếu sheet 1.Chăm sóc hoặc 3.Chấm buổi');

  const careRows = readRows(careSheet, ROW_LIMIT);
  const selectedKeys = new Set(careRows.map((row) => `${field(row, 'ID')}::${field(row, 'Gói học')}`));
  const attendanceRows = readRows(attendanceSheet, attendanceSheet.rowCount)
    .filter((row) => selectedKeys.has(`${field(row, 'ID')}::${field(row, 'Gói học')}`))
    .slice(0, ROW_LIMIT);
  if (careRows.length !== ROW_LIMIT) throw new Error(`Chỉ tìm thấy ${careRows.length}/${ROW_LIMIT} dòng Sheet 1 hợp lệ`);

  console.log('Xóa dữ liệu cũ...');
  await resetDatabase();

  const passwordHash = bcrypt.hashSync('123456', 10);
  const admin = await prisma.user.create({ data: { name: 'Quản trị viên', email: 'admin@gmail.com', password_hash: passwordHash, roles: ['ADMIN'], active: true } });
  const csUsers = await Promise.all([1, 2, 3].map((number) => prisma.user.create({
    data: { name: `CSKH ${number}`, email: `cskh${number}@gmail.com`, password_hash: passwordHash, roles: ['CS'], active: true, created_by_id: admin.id },
  })));
  const defaultTeacher = await prisma.user.create({ data: { name: 'Giáo viên phụ trách', email: 'teacher@gmail.com', password_hash: passwordHash, roles: ['TEACHER'], active: true, created_by_id: admin.id } });
  await prisma.teacherProfile.create({ data: { user_id: defaultTeacher.id, teacher_code: 'GV-MOCK', teacher_type: TeacherType.OTHER } });
  const group = await prisma.cSGroup.create({ data: { group_name: 'Nhóm CSKH', active: true } });
  await prisma.cSGroupMember.createMany({ data: csUsers.map((user) => ({ cs_group_id: group.id, user_id: user.id })) });
  await prisma.manageAssignment.create({ data: { manage_user_id: admin.id, cs_group_id: group.id } });
  await prisma.careMilestoneConfig.createMany({ data: [1, 3, 10, 20, 30].map((session, index) => ({ session_number: session, display_order: index + 1, created_by_id: admin.id })) });

  const enrollmentByKey = new Map<string, { id: number; classId: number; enrollmentClassId: number }>();
  for (let index = 0; index < careRows.length; index++) {
    const row = careRows[index];
    const externalId = field(row, 'ID');
    const packageCode = field(row, 'Gói học');
    const totalSessions = Math.max(1, integer(field(row, 'Tổng số buổi'), 30));
    const cs = csUsers[index % csUsers.length];
    const saleCode = field(row, 'Sale') || `SALE-${(index % 3) + 1}`;
    const sale = await prisma.sale.upsert({ where: { code: saleCode }, update: {}, create: { code: saleCode, name: saleCode, active: true } });
    const pkg = await prisma.package.upsert({
      where: { code: packageCode },
      update: { default_total_sessions: totalSessions },
      create: { code: packageCode, name: `Gói ${packageCode}`, default_total_sessions: totalSessions, active: true },
    });
    const student = await prisma.student.create({ data: {
      external_id: externalId,
      full_name: field(row, 'Họ tên HV'),
      gender: field(row, 'Giới tính') || null,
      phone: field(row, 'SĐT') || null,
      email: field(row, 'Email') || null,
      date_of_birth: parseDate(field(row, 'DOB')),
      occupation: field(row, 'Nghề nghiệp') || null,
      note: field(row, 'Ghi chú sale', 'Ghi chú Sale') || null,
    } });
    const className = firstLine(field(row, 'Tên lớp')) || `${field(row, 'Họ tên HV')} - ${field(row, 'Trình độ') || packageCode}`;
    const classCode = `CLS-${externalId}-${index + 1}`;
    const learningClass = await prisma.class.create({ data: {
      class_code: classCode,
      class_name: className,
      level: field(row, 'Trình độ') || null,
      model_type: classModel(field(row, 'Mô hình', 'Mô hình lớp')),
      attendance_source: 'LEARNING_SYSTEM',
      active: true,
    } });
    await prisma.classTeacher.create({ data: { class_id: learningClass.id, teacher_id: defaultTeacher.id, role: 'MAIN', start_date: parseDate(field(row, 'Ngày bắt đầu học')), active: true } });
    const schedulePattern = firstLine(field(row, 'Lịch học (1)'));
    if (schedulePattern || field(row, 'Giờ học (1)')) {
      await prisma.classSchedule.create({ data: {
        class_id: learningClass.id,
        schedule_pattern: schedulePattern || 'Theo lịch học viên',
        start_time: timeValue(field(row, 'Giờ học (1)')),
        duration_minutes: integer(field(row, 'Thời lượng buổi học (1)'), 30),
        valid_from: parseDate(field(row, 'Ngày bắt đầu học')),
        valid_to: parseDate(field(row, 'Ngày kết thúc/Bảo lưu')),
        active: true,
      } });
    }
    const enrollment = await prisma.enrollment.create({ data: {
      external_id: externalId,
      student_id: student.id,
      package_id: pkg.id,
      cs_id: cs.id,
      sale_id: sale.id,
      sale_name: saleCode,
      paid_at: parseDate(field(row, 'Ngày nộp học phí')),
      student_source_status: field(row, 'Trạng thái HV') || null,
      course_content: field(row, 'Nội dung khoá') || null,
      payment_status: field(row, 'Trạng thái thanh toán') || null,
      course_teacher_type: field(row, 'Khoá học') || null,
      level: field(row, 'Trình độ') || null,
      total_sessions: totalSessions,
      class_model: field(row, 'Mô hình', 'Mô hình lớp') || null,
      sales_note: field(row, 'Ghi chú sale', 'Ghi chú Sale') || null,
      callback_note: field(row, 'Lịch hẹn gọi') || null,
      hot_issue_note: field(row, 'Điểm nóng') || null,
      start_date: parseDate(field(row, 'Ngày bắt đầu học')),
      end_date: parseDate(field(row, 'Ngày kết thúc/Bảo lưu')),
      status: enrollmentStatus(field(row, 'Trạng thái')),
      external_remaining_sessions: integer(field(row, 'Số buổi còn lại'), totalSessions),
      attended_previous_years: integer(field(row, 'Tổng số buổi đã học năm trước', 'Tổng số buổi đã học'), 0),
      external_synced_at: new Date(),
      handed_over_at: parseDate(field(row, 'Ngày bàn giao')),
      account_created_at: parseDate(field(row, 'Ngày tạo tài khoản')),
    } });
    const enrollmentClass = await prisma.enrollmentClass.create({ data: {
      enrollment_id: enrollment.id,
      class_id: learningClass.id,
      sequence_no: 1,
      start_date: enrollment.start_date,
      end_date: enrollment.end_date,
      status: enrollment.status === EnrollmentStatus.FINISHED ? EnrollmentClassStatus.COMPLETED : enrollment.status === EnrollmentStatus.PAUSED ? EnrollmentClassStatus.TRANSFERRED : EnrollmentClassStatus.ACTIVE,
    } });
    enrollmentByKey.set(`${externalId}::${packageCode}`, { id: enrollment.id, classId: learningClass.id, enrollmentClassId: enrollmentClass.id });
    const callback = field(row, 'Lịch hẹn gọi');
    const hotIssue = field(row, 'Điểm nóng');
    if (callback) await prisma.careTask.create({ data: { enrollment_id: enrollment.id, assigned_to_id: cs.id, type: 'CALLBACK', title: 'Lịch hẹn gọi từ Excel', note: callback, priority: 'NORMAL', status: 'PENDING' } });
    if (hotIssue) await prisma.careTask.create({ data: { enrollment_id: enrollment.id, assigned_to_id: cs.id, type: 'HOT_ISSUE', title: 'Điểm nóng từ Excel', note: hotIssue, priority: 'HIGH', status: 'PENDING' } });
  }

  let attendanceCount = 0;
  for (const row of attendanceRows) {
    const key = `${field(row, 'ID')}::${field(row, 'Gói học')}`;
    const target = enrollmentByKey.get(key);
    if (!target) continue;
    let sessionNumber = 0;
    const ordered = [...row.attendance].sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const item of ordered) {
      const parsed = attendance(item.value);
      if (!parsed) continue;
      sessionNumber++;
      const session = await prisma.classSession.create({ data: {
        class_id: target.classId,
        session_number: sessionNumber,
        session_date: item.date,
        teacher_id: defaultTeacher.id,
        status: 'COMPLETED',
        created_by_id: admin.id,
      } });
      await prisma.attendance.create({ data: {
        enrollment_class_id: target.enrollmentClassId,
        class_session_id: session.id,
        status: parsed.status,
        session_count: parsed.count,
        source: AttendanceSource.EXCEL_IMPORT,
        created_by_id: admin.id,
      } });
      attendanceCount++;
    }
  }

  const batch = await prisma.importBatch.create({ data: {
    uploaded_by_id: admin.id,
    file_name: path.basename(SOURCE_FILE),
    import_type: 'WORKBOOK',
    total_rows: careRows.length + attendanceRows.length,
    success_rows: careRows.length + attendanceRows.length,
    failed_rows: 0,
    status: 'COMPLETED',
    completed_at: new Date(),
  } });
  await prisma.importRow.createMany({ data: careRows.map((row) => ({
    import_batch_id: batch.id,
    row_number: row.rowNumber,
    raw_data: row.values,
    status: 'SUCCESS',
    entity_type: 'Enrollment',
    entity_id: enrollmentByKey.get(`${field(row, 'ID')}::${field(row, 'Gói học')}`)?.id.toString(),
  })) });
  await prisma.auditLog.create({ data: { user_id: admin.id, action: 'SEED_WORKBOOK_SAMPLE', entity_type: 'ImportBatch', entity_id: String(batch.id), after_data: { source: path.basename(SOURCE_FILE), careRows: careRows.length, attendanceRows: attendanceRows.length, attendanceRecords: attendanceCount } } });

  const counts = {
    users: await prisma.user.count(), students: await prisma.student.count(), enrollments: await prisma.enrollment.count(),
    classes: await prisma.class.count(), sessions: await prisma.classSession.count(), attendances: await prisma.attendance.count(),
  };
  console.log('Hoàn tất seed:', counts);
  console.log(`Sheet 1: ${careRows.length} dòng; Sheet 3 khớp: ${attendanceRows.length} dòng; Điểm danh: ${attendanceCount}`);
}

main()
  .catch((error) => { console.error('Seed thất bại:', error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
