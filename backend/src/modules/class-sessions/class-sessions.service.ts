import { ClassSessionsRepository } from './class-sessions.repository';
import { CreateClassSessionDTO, UpdateClassSessionDTO } from './class-sessions.types';
import { prisma } from '../../prisma/client';
import { Prisma } from '@prisma/client';
import { AppError } from '../../middlewares/error.middleware';

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
    if (data.session_number) {
      const exists = await this.repository.findByClassAndNumber(classId, data.session_number);
      if (exists) throw new AppError(409, 'Số thứ tự buổi đã tồn tại trong lớp');
    }

    const classExists = await prisma.class.findUnique({ where: { id: classId } });
    if (!classExists) throw new AppError(404, 'Không tìm thấy lớp học');

    if (data.teacher_id) {
      const teacher = await prisma.user.findUnique({ where: { id: data.teacher_id } });
      if (!teacher || !(teacher.roles as string[]).includes('TEACHER')) {
        throw new AppError(400, 'Không tìm thấy giáo viên hợp lệ');
      }
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.repository.create(classId, data, userId);
      } catch (error) {
        const retryable =
          !data.session_number &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034');
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new AppError(409, 'Không thể cấp số buổi, vui lòng thử lại');
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
    if (session.status === 'CANCELLED') throw new AppError(409, 'Buổi học đã được hủy');
    return this.repository.cancel(classId, sessionId);
  }

  async deleteSession(classId: number, sessionId: number, userId: number, confirmed: boolean) {
    const session = await this.getSession(classId, sessionId);
    const attendanceCount = session.attendance.length;
    if (attendanceCount > 0 && !confirmed) {
      throw new AppError(409, `Buổi học có ${attendanceCount} bản ghi điểm danh. Xác nhận để xóa toàn bộ.`);
    }
    const result = await this.repository.delete(classId, sessionId, userId);
    if (!result) throw new AppError(404, 'Không tìm thấy buổi học');
    return result;
  }
}
