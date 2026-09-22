import { ClassesRepository } from './classes.repository';
import { CreateClassDTO, UpdateClassDTO, AssignTeacherDTO } from './classes.types';
import { prisma } from '../../prisma/client';
import { ClassModelType, AttendanceSourceType } from '@prisma/client';

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

  formatClass<T extends { model_type: any }>(cls: T): T {
    if (!cls) return cls;
    return {
      ...cls,
      model_type: this.formatModelType(cls.model_type),
    };
  }

  async generateUniqueClassCode(): Promise<string> {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let attempts = 0; attempts < 50; attempts++) {
      let code = 'CLS_';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.repository.findByCode(code);
      if (!existing) return code;
    }
    return `CLS_${Date.now().toString(36).toUpperCase()}`;
  }

  async getAllClasses() {
    const classes = await this.repository.findAll();
    return classes.map((c) => this.formatClass(c));
  }

  async getClassById(id: number) {
    const cls = await this.repository.findById(id);
    if (!cls) throw new CustomError('Class not found', 404);
    return this.formatClass(cls);
  }

  async createClass(data: CreateClassDTO) {
    let classCode = data.class_code ? data.class_code.trim() : '';
    if (!classCode) {
      classCode = await this.generateUniqueClassCode();
    }

    const modelType = this.normalizeModelType(data.model_type);
    const attendanceSource = (data.attendance_source as AttendanceSourceType) || AttendanceSourceType.LEARNING_SYSTEM;

    const created = await this.repository.create({
      class_code: classCode,
      class_name: data.class_name.trim(),
      level: data.level?.trim() || undefined,
      model_type: modelType,
      attendance_source: attendanceSource,
    });
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

    const teacher = await prisma.user.findUnique({ where: { id: data.teacher_id } });
    if (!teacher || !(teacher.roles as string[]).includes('TEACHER')) {
      throw new CustomError('Teacher not found or user is not a teacher', 404);
    }

    return this.repository.assignTeacher(classId, data);
  }
}
