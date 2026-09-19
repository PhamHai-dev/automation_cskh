import { ClassSessionsRepository } from './class-sessions.repository';
import { CreateClassSessionDTO, UpdateClassSessionDTO } from './class-sessions.types';
import { prisma } from '../../prisma/client';

export class ClassSessionsService {
  private repository: ClassSessionsRepository;

  constructor() {
    this.repository = new ClassSessionsRepository();
  }

  async listByClass(classId: number) {
    return this.repository.findByClassId(classId);
  }

  async getSession(classId: number, sessionId: number) {
    const session = await this.repository.findById(classId, sessionId);
    if (!session) {
      throw new Error('ClassSession not found');
    }
    return session;
  }

  async createSession(classId: number, data: CreateClassSessionDTO, userId: number) {
    const exists = await this.repository.findByClassAndNumber(classId, data.session_number);
    if (exists) {
      throw new Error('Session number already exists in this class');
    }

    const classExists = await prisma.class.findUnique({ where: { id: classId } });
    if (!classExists) {
      throw new Error('Class not found');
    }

    if (data.teacher_id) {
      const teacher = await prisma.user.findUnique({ where: { id: data.teacher_id } });
      if (!teacher || !(teacher.roles as string[]).includes('TEACHER')) {
        throw new Error('Teacher not found or user is not a teacher');
      }
    }

    return this.repository.create(classId, data, userId);
  }

  async updateSession(classId: number, sessionId: number, data: UpdateClassSessionDTO) {
    const session = await this.getSession(classId, sessionId);

    if (data.session_number && data.session_number !== session.session_number) {
      const exists = await this.repository.findByClassAndNumber(classId, data.session_number);
      if (exists) {
        throw new Error('Session number already exists in this class');
      }
    }

    return this.repository.update(classId, sessionId, data);
  }

  async cancelSession(classId: number, sessionId: number) {
    const session = await this.getSession(classId, sessionId);
    if (session.status === 'CANCELLED') {
      throw new Error('Session is already cancelled');
    }
    return this.repository.cancel(classId, sessionId);
  }
}
