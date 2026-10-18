import { ClassesRepository } from './classes.repository';
import { CreateClassDTO, UpdateClassDTO, AssignTeacherDTO } from './classes.types';
import { prisma } from '../../prisma/client';
import { ClassModelType, AttendanceSourceType } from '@prisma/client';
import { AuthUser } from '../../middlewares/auth.middleware';
import { getAccessibleClassIds, assertClassAccess } from './classes.scope';

class CustomError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class ClassesService {
  private repository: ClassesRepository;

  constructor() {
    this.repository = new ClassesRepository();
  }

  normalizeModelType(type?: string): ClassModelType {
    if (type === '1:1' || type === 'ONE_TO_ONE') return ClassModelType.ONE_TO_ONE;
    if (type === '1:2' || type === 'ONE_TO_TWO') return ClassModelType.ONE_TO_TWO;
    if (type === '1:n' || type === 'ONE_TO_N' || type === 'GROUP') return ClassModelType.ONE_TO_N;
    return ClassModelType.ONE_TO_ONE;
  }

  formatModelType(type?: string): '1:1' | '1:2' | '1:n' {
    if (type === 'ONE_TO_ONE' || type === '1:1') return '1:1';
    if (type === 'ONE_TO_TWO' || type === '1:2') return '1:2';
    if (type === 'ONE_TO_N' || type === '1:n' || type === 'GROUP') return '1:n';
    return '1:1';
  }

  formatCompactClassCode(id: number): string {
    return `class_${String(id).padStart(4, '0')}`;
  }

  formatClass<T extends { id?: number; class_code?: string | null; model_type: any }>(cls: T): T {
    if (!cls) return cls;
    const rawCode = cls.class_code ? String(cls.class_code).trim() : '';
    const shouldCompact = !rawCode || /^(CLS_|id\d+$)/i.test(rawCode);
    const normalizedCode = shouldCompact && cls.id ? this.formatCompactClassCode(cls.id) : (rawCode || cls.class_code);
    return {
      ...cls,
      class_code: normalizedCode,
      model_type: this.formatModelType(cls.model_type),
    };
  }

  async generateUniqueClassCode(): Promise<string> {
    const lastClass = await prisma.class.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    let nextNum = (lastClass?.id || 0) + 1;
    for (let attempts = 0; attempts < 100; attempts++) {
      const code = this.formatCompactClassCode(nextNum);
      const existing = await this.repository.findByCode(code);
      if (!existing) return code;
      nextNum++;
    }
    return this.formatCompactClassCode(nextNum);
  }

  async getAllClasses(user?: AuthUser) {
    const accessibleIds = user ? await getAccessibleClassIds(user) : null;
    const classes = await this.repository.findAll(accessibleIds);
    for (const c of classes) {
      if (!c.class_code || /^(CLS_|id\d+$)/i.test(c.class_code)) {
        const targetCode = this.formatCompactClassCode(c.id);
        const existingWithCode = await this.repository.findByCode(targetCode);
        if (!existingWithCode || existingWithCode.id === c.id) {
          await this.repository.update(c.id, { class_code: targetCode });
          c.class_code = targetCode;
        }
      }
    }
    return classes.map((c) => this.formatClass(c));
  }

  async getClassById(id: number, user?: AuthUser) {
    if (user) {
      await assertClassAccess(user, id, 'xem chi tiết lớp học này');
    }
    const cls = await this.repository.findById(id);
    if (!cls) throw new CustomError('Class not found', 404);
    if (!cls.class_code || /^(CLS_|id\d+$)/i.test(cls.class_code)) {
      const targetCode = this.formatCompactClassCode(cls.id);
      const existingWithCode = await this.repository.findByCode(targetCode);
      if (!existingWithCode || existingWithCode.id === cls.id) {
        await this.repository.update(cls.id, { class_code: targetCode });
        cls.class_code = targetCode;
      }
    }
    return this.formatClass(cls);
  }

  async createClass(data: CreateClassDTO) {
    const customCode = data.class_code ? data.class_code.trim() : '';
    let classCode = customCode;
    if (!classCode) {
      classCode = await this.generateUniqueClassCode();
    }

    const modelType = this.normalizeModelType(data.model_type);
    const attendanceSource = (data.attendance_source as AttendanceSourceType) || AttendanceSourceType.LEARNING_SYSTEM;

    let created = await this.repository.create({
      class_code: classCode,
      class_name: data.class_name.trim(),
      level: data.level?.trim() || undefined,
      model_type: modelType,
      attendance_source: attendanceSource,
    });

    if (!customCode) {
      const compactCode = this.formatCompactClassCode(created.id);
      if (created.class_code !== compactCode) {
        const existingWithCode = await this.repository.findByCode(compactCode);
        if (!existingWithCode || existingWithCode.id === created.id) {
          created = await this.repository.update(created.id, { class_code: compactCode });
        }
      }
    }

    return this.formatClass(created);
  }

  async updateClass(id: number, data: UpdateClassDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new CustomError('Class not found', 404);

    const updatePayload: any = {};
    if (data.class_name !== undefined) {
      updatePayload.class_name = data.class_name.trim();
    }
    if (data.class_code !== undefined) {
      updatePayload.class_code = data.class_code ? data.class_code.trim() : existing.class_code;
    }
    if (data.level !== undefined) {
      updatePayload.level = data.level ? data.level.trim() : null;
    }
    if (data.model_type !== undefined) {
      updatePayload.model_type = this.normalizeModelType(data.model_type);
    }
    if (data.attendance_source !== undefined) {
      updatePayload.attendance_source = data.attendance_source as AttendanceSourceType;
    }
    if (data.active !== undefined) {
      updatePayload.active = data.active;
    }

    const updated = await this.repository.update(id, updatePayload);
    return this.formatClass(updated);
  }

  async assignTeacher(classId: number, data: AssignTeacherDTO) {
    const existing = await this.repository.findById(classId);
    if (!existing) throw new CustomError('Class not found', 404);

    let teacherRecord = await prisma.teacher.findUnique({ where: { id: data.teacher_id } });
    if (!teacherRecord) {
      teacherRecord = await prisma.teacher.findUnique({ where: { user_id: data.teacher_id } });
    }
    if (!teacherRecord) {
      const user = await prisma.user.findUnique({ where: { id: data.teacher_id }, include: { teacher: true } });
      if (user?.teacher) {
        teacherRecord = user.teacher;
      }
    }

    if (!teacherRecord) {
      throw new CustomError('Teacher not found or user is not a teacher', 404);
    }

    return this.repository.assignTeacher(classId, {
      ...data,
      teacher_id: teacherRecord.id,
    });
  }
}
