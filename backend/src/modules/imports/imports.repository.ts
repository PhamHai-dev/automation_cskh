import { PrismaClient, ImportBatch, ImportRow, ImportBatchStatus, ImportRowStatus, ImportType, AttendanceStatus, AttendanceSource, EnrollmentStatus, EnrollmentClassStatus, ClassModelType, AttendanceSourceType } from '@prisma/client';
import { prisma } from '../../prisma/client';

export class ImportsRepository {
  private db: PrismaClient;

  constructor(dbClient?: PrismaClient) {
    this.db = dbClient || prisma;
  }

  async createBatch(data: {
    uploaded_by_id: number;
    file_name: string;
    import_type: ImportType;
    status?: ImportBatchStatus;
    total_rows?: number;
  }): Promise<ImportBatch> {
    return this.db.importBatch.create({
      data: {
        uploaded_by_id: data.uploaded_by_id,
        file_name: data.file_name,
        import_type: data.import_type,
        status: data.status || ImportBatchStatus.PREVIEW,
        total_rows: data.total_rows || 0,
      },
      include: {
        uploaded_by: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findBatchById(id: number) {
    return this.db.importBatch.findUnique({
      where: { id },
      include: {
        uploaded_by: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async updateBatch(id: number, data: Partial<ImportBatch>) {
    return this.db.importBatch.update({
      where: { id },
      data,
      include: {
        uploaded_by: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async listBatches(limit = 50, offset = 0) {
    return this.db.importBatch.findMany({
      take: limit,
      skip: offset,
      orderBy: { created_at: 'desc' },
      include: {
        uploaded_by: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async countBatches() {
    return this.db.importBatch.count();
  }

  async createImportRows(
    rows: {
      import_batch_id: number;
      row_number: number;
      raw_data: any;
      status: ImportRowStatus;
      error_message?: string | null;
      entity_type?: string | null;
      entity_id?: string | null;
    }[]
  ) {
    return this.db.importRow.createMany({
      data: rows,
    });
  }

  async findImportRows(import_batch_id: number, status?: ImportRowStatus) {
    return this.db.importRow.findMany({
      where: {
        import_batch_id,
        ...(status ? { status } : {}),
      },
      orderBy: { row_number: 'asc' },
    });
  }

  async clearPendingImportRows(import_batch_id: number) {
    return this.db.importRow.deleteMany({
      where: { import_batch_id },
    });
  }

  // Lookup helpers for validation & import
  async findStudentByExternalId(external_id: string) {
    return this.db.student.findUnique({
      where: { external_id },
      include: {
        enrollments: {
          include: {
            enrollment_classes: {
              include: { class: true },
            },
          },
        },
      },
    });
  }

  async findStudentByExternalIdOrName(externalId?: string, fullName?: string) {
    const conditions: any[] = [];
    if (externalId && externalId.trim()) {
      conditions.push({ external_id: externalId.trim() });
    }
    if (fullName && fullName.trim()) {
      conditions.push({ full_name: fullName.trim() });
    }
    if (conditions.length === 0) return null;

    return this.db.student.findFirst({
      where: {
        OR: conditions,
      },
      include: {
        enrollments: {
          include: {
            enrollment_classes: {
              include: { class: true },
            },
          },
        },
      },
    });
  }

  async findStudentByPhoneOrEmail(phone?: string, email?: string) {
    if (!phone && !email) return null;
    return this.db.student.findFirst({
      where: {
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      include: {
        enrollments: {
          include: {
            enrollment_classes: {
              include: { class: true },
            },
          },
        },
      },
    });
  }

  async upsertStudent(data: {
    external_id?: string;
    full_name: string;
    gender?: string | null;
    phone?: string | null;
    email?: string | null;
    date_of_birth?: Date | null;
    occupation?: string | null;
    note?: string | null;
  }) {
    if (data.external_id) {
      const existing = await this.db.student.findUnique({
        where: { external_id: data.external_id },
      });
      if (existing) {
        return this.db.student.update({
          where: { id: existing.id },
          data: {
            full_name: data.full_name || existing.full_name,
            gender: data.gender ?? existing.gender,
            phone: data.phone ?? existing.phone,
            email: data.email ?? existing.email,
            date_of_birth: data.date_of_birth ?? existing.date_of_birth,
            occupation: data.occupation ?? existing.occupation,
            note: data.note ?? existing.note,
          },
        });
      }
    }

    return this.db.student.create({
      data: {
        external_id: data.external_id,
        full_name: data.full_name,
        gender: data.gender,
        phone: data.phone,
        email: data.email,
        date_of_birth: data.date_of_birth,
        occupation: data.occupation,
        note: data.note,
      },
    });
  }

  async findPackageByCode(code: string) {
    return this.db.package.findUnique({
      where: { code },
    });
  }

  async createPackageIfNotExist(code: string, default_total_sessions?: number) {
    const existing = await this.db.package.findUnique({ where: { code } });
    if (existing) return existing;
    return this.db.package.create({
      data: {
        code,
        name: `Gói ${code}`,
        default_total_sessions: default_total_sessions || 30,
        active: true,
      },
    });
  }

  async findCSUserByIdOrEmail(id?: number, email?: string) {
    if (id) {
      return this.db.user.findUnique({ where: { id } });
    }
    if (email) {
      return this.db.user.findUnique({ where: { email } });
    }
    return null;
  }

  async findDefaultCSUser() {
    // Find any CS user, or Admin as fallback
    const cs = await this.db.user.findFirst({
      where: {
        active: true,
      },
    });
    return cs;
  }

  async findOrCreateSale(code: string, name?: string) {
    const trimmedCode = code.trim();
    if (!trimmedCode) return null;
    const existing = await this.db.sale.findUnique({ where: { code: trimmedCode } });
    if (existing) return existing;
    return this.db.sale.create({
      data: {
        code: trimmedCode,
        name: (name && name.trim()) || trimmedCode,
        active: true,
      },
    });
  }

  async createEnrollment(data: {
    external_id?: string;
    student_id: number;
    package_id?: number | null;
    cs_id: number;
    paid_at?: Date | null;
    sale_id?: number | null;
    sale_name?: string | null;
    student_source_status?: string | null;
    course_content?: string | null;
    payment_status?: string | null;
    course_teacher_type?: string | null;
    level?: string | null;
    total_sessions: number;
    class_model?: string | null;
    sales_note?: string | null;
    start_date?: Date | null;
    end_date?: Date | null;
    status?: EnrollmentStatus;
    external_remaining_sessions?: number | null;
  }) {
    return this.db.enrollment.create({
      data: {
        external_id: data.external_id,
        student_id: data.student_id,
        package_id: data.package_id,
        cs_id: data.cs_id,
        paid_at: data.paid_at,
        sale_id: data.sale_id,
        sale_name: data.sale_name,
        student_source_status: data.student_source_status,
        course_content: data.course_content,
        payment_status: data.payment_status,
        course_teacher_type: data.course_teacher_type,
        level: data.level,
        total_sessions: data.total_sessions,
        class_model: data.class_model,
        sales_note: data.sales_note,
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.status || EnrollmentStatus.NOT_STARTED,
        external_remaining_sessions: data.external_remaining_sessions,
        external_synced_at: new Date(),
      },
    });
  }

  async findClassByNameOrCode(nameOrCode: string) {
    return this.db.class.findFirst({
      where: {
        OR: [
          { class_name: nameOrCode },
          { class_code: nameOrCode },
        ],
      },
    });
  }

  async createClassIfNotExist(className: string, level?: string, model_type: ClassModelType = ClassModelType.ONE_TO_ONE) {
    const existing = await this.findClassByNameOrCode(className);
    if (existing) return existing;
    return this.db.class.create({
      data: {
        class_name: className,
        class_code: className,
        level: level || null,
        model_type,
        attendance_source: AttendanceSourceType.LEARNING_SYSTEM,
        active: true,
      },
    });
  }

  async createEnrollmentClass(data: {
    enrollment_id: number;
    class_id: number;
    sequence_no: number;
    start_date?: Date | null;
    end_date?: Date | null;
    status?: EnrollmentClassStatus;
  }) {
    return this.db.enrollmentClass.create({
      data: {
        enrollment_id: data.enrollment_id,
        class_id: data.class_id,
        sequence_no: data.sequence_no,
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.status || EnrollmentClassStatus.ACTIVE,
      },
    });
  }

  async findActiveEnrollmentClassByStudentId(studentId: number) {
    return this.db.enrollmentClass.findFirst({
      where: {
        enrollment: {
          student_id: studentId,
        },
      },
      include: {
        class: true,
        enrollment: true,
      },
      orderBy: {
        sequence_no: 'desc',
      },
    });
  }

  async findOrCreateClassSession(class_id: number, session_date: Date, created_by_id: number) {
    // Check if session exists on that date for this class
    let session = await this.db.classSession.findFirst({
      where: {
        class_id,
        session_date,
      },
    });

    if (!session) {
      // Find max session_number for this class
      const lastSession = await this.db.classSession.findFirst({
        where: { class_id },
        orderBy: { session_number: 'desc' },
      });
      const nextNumber = (lastSession?.session_number || 0) + 1;

      session = await this.db.classSession.create({
        data: {
          class_id,
          session_number: nextNumber,
          session_date,
          created_by_id,
        },
      });
    }

    return session;
  }

  async upsertAttendance(data: {
    enrollment_class_id: number;
    class_session_id: number;
    status: AttendanceStatus;
    source: AttendanceSource;
    created_by_id: number;
  }) {
    return this.db.attendance.upsert({
      where: {
        enrollment_class_id_class_session_id: {
          enrollment_class_id: data.enrollment_class_id,
          class_session_id: data.class_session_id,
        },
      },
      update: {
        status: data.status,
        source: data.source,
      },
      create: {
        enrollment_class_id: data.enrollment_class_id,
        class_session_id: data.class_session_id,
        status: data.status,
        source: data.source,
        created_by_id: data.created_by_id,
      },
    });
  }

  async createAuditLog(data: {
    user_id: number;
    action: string;
    entity_type: string;
    entity_id: string;
    before_data?: any;
    after_data?: any;
    ip_address?: string;
  }) {
    return this.db.auditLog.create({
      data: {
        user_id: data.user_id,
        action: data.action,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        before_data: data.before_data,
        after_data: data.after_data,
        ip_address: data.ip_address,
      },
    });
  }

  async getTeacherAssignedClassIds(teacherUserId: number): Promise<number[]> {
    const records = await this.db.classTeacher.findMany({
      where: { teacher_id: teacherUserId, active: true },
      select: { class_id: true },
    });
    return records.map((r) => r.class_id);
  }

  async getTeacherAssignedClassNames(teacherUserId: number): Promise<string[]> {
    const records = await this.db.classTeacher.findMany({
      where: { teacher_id: teacherUserId, active: true },
      include: { class: true },
    });
    const names = new Set<string>();
    records.forEach((r) => {
      if (r.class.class_name) names.add(r.class.class_name.toLowerCase().trim());
      if (r.class.class_code) names.add(r.class.class_code.toLowerCase().trim());
    });
    return Array.from(names);
  }

  async getAllStudentsWithEnrollments(filter?: { cs_id?: number }) {
    return this.db.student.findMany({
      where: filter?.cs_id ? { enrollments: { some: { cs_id: filter.cs_id } } } : undefined,
      include: {
        enrollments: {
          where: filter?.cs_id ? { cs_id: filter.cs_id } : undefined,
          include: {
            package: true,
            cs: { select: { id: true, name: true, email: true } },
            enrollment_classes: {
              include: { class: true },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getAllAttendances(filter?: { classIds?: number[]; cs_id?: number }) {
    return this.db.attendance.findMany({
      where: {
        ...(filter?.classIds ? { enrollment_class: { class_id: { in: filter.classIds } } } : {}),
        ...(filter?.cs_id ? { enrollment_class: { enrollment: { cs_id: filter.cs_id } } } : {}),
      },
      include: {
        enrollment_class: {
          include: {
            class: true,
            enrollment: {
              include: {
                student: true,
                package: true,
              },
            },
          },
        },
        class_session: true,
        created_by: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { class_session: { session_date: 'desc' } },
    });
  }
}
