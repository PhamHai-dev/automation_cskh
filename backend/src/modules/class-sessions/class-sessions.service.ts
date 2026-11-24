import { ClassSessionsRepository } from './class-sessions.repository';
import { CreateClassSessionDTO, UpdateClassSessionDTO, ActualSessionResult } from './class-sessions.types';
import { prisma } from '../../prisma/client';
import { Prisma } from '@prisma/client';
import { AppError } from '../../middlewares/error.middleware';
import { AuthUser } from '../../middlewares/auth.middleware';
import { assertClassAccess } from '../classes/classes.scope';

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

  async createSession(classId: number, data: CreateClassSessionDTO, actor: AuthUser) {
    this.assertMetadataPermission(data, actor);
    if (data.session_number && !data.idempotency_key) {
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

    const sessionType = data.session_type ?? 'LESSON';
    const sessionTitle = data.session_title?.trim() || null;
    if (sessionType === 'TEST' && !sessionTitle) throw new AppError(400, 'Buổi TEST bắt buộc có tên');
    if (sessionType === 'TEST' && sessionTitle) {
      const duplicate = await this.repository.findTestByTitle(classId, sessionTitle);
      if (duplicate) throw new AppError(409, 'Tên buổi TEST không được trùng trong lớp');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return data.idempotency_key
          ? await this.repository.createIdempotent(classId, data, actor.id)
          : await this.repository.create(classId, data, actor.id);
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

  /** Teacher-only actual-session path. Scope is checked against the existing class-access helper. */
  async createActualSession(classId: number, data: CreateClassSessionDTO, userId: number): Promise<ActualSessionResult> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, roles: true } });
    if (!user) throw new AppError(401, 'Không tìm thấy tài khoản');
    const actor = { id: user.id, roles: user.roles as string[] };
    await assertClassAccess(actor, classId, 'ghi nhận ca thực học cho lớp này');
    if (!actor.roles.includes('TEACHER') && !actor.roles.includes('ADMIN') && !actor.roles.includes('MANAGE')) {
      throw new AppError(403, 'Chỉ giáo viên mới được ghi nhận ca thực học');
    }

    const teacherId = data.teacher_id ?? userId;
    // No acting-for/impersonation policy is invented for this route. The new flow is bound
    // to the logged-in TEACHER actor; privileged staff keep their existing admin flows.
    if (!actor.roles.includes('TEACHER') || actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE')) {
      throw new AppError(403, 'Luồng ghi ca thực học chỉ dành cho tài khoản giáo viên');
    }
    if (teacherId !== userId) {
      throw new AppError(403, 'Giáo viên không được ghi nhận thay tài khoản khác');
    }
    const classExists = await prisma.class.findUnique({ where: { id: classId } });
    if (!classExists) throw new AppError(404, 'Không tìm thấy lớp học');
    if (!data.idempotency_key || !data.enrollment_class_id) throw new AppError(400, 'Thiếu khóa yêu cầu hoặc ghi danh lớp');
    return this.repository.createIdempotent(classId, { ...data, teacher_id: userId, status: 'COMPLETED' }, userId);
  }

  async updateSession(classId: number, sessionId: number, data: UpdateClassSessionDTO, actor: AuthUser) {
    this.assertMetadataPermission(data, actor);
    const session = await this.getSession(classId, sessionId);

    if (data.session_number && data.session_number !== session.session_number) {
      if (session.attendance.length > 0 || session.jlpt_learning_records.length > 0) {
        throw new AppError(409, 'Không thể đổi số thứ tự khi buổi đã có điểm danh hoặc dữ liệu JLPT');
      }
      const exists = await this.repository.findByClassAndNumber(classId, data.session_number);
      if (exists) throw new AppError(409, 'Số thứ tự buổi đã tồn tại trong lớp');
    }

    const nextType = data.session_type ?? session.session_type;
    const nextTitle = data.session_title !== undefined ? data.session_title?.trim() || null : session.session_title;
    if (nextType === 'TEST' && !nextTitle) throw new AppError(400, 'Buổi TEST bắt buộc có tên');
    if (nextType === 'TEST' && nextTitle) {
      const duplicate = await this.repository.findTestByTitle(classId, nextTitle, sessionId);
      if (duplicate) throw new AppError(409, 'Tên buổi TEST không được trùng trong lớp');
    }

    return this.repository.update(classId, sessionId, data, actor.id);
  }

  async cancelSession(classId: number, sessionId: number, reason?: string, userId?: number) {
    const session = await this.getSession(classId, sessionId);
    if (session.status === 'CANCELLED') throw new AppError(409, 'Buổi học đã được hủy');
    const result = await this.repository.cancel(classId, sessionId);
    // C.6: the ClassSession table has no cancel-reason column and we do NOT edit
    // the schema/migration. Persist the reason durably through the existing
    // AuditLog, keyed to the session, so it can be recovered/attributed later.
    if (userId) {
      try {
        await prisma.auditLog.create({
          data: {
            user_id: userId,
            action: 'CANCEL',
            entity_type: 'ClassSession',
            entity_id: String(sessionId),
            before_data: { status: session.status } as any,
            after_data: { status: 'CANCELLED', reason: reason ?? null, class_id: classId } as any,
          },
        });
      } catch {
        // Audit is best-effort; a logging failure must not block the cancel itself.
      }
    }
    return result;
  }

  private assertMetadataPermission(
    data: Pick<CreateClassSessionDTO, 'session_type' | 'session_title'>,
    actor: AuthUser,
  ) {
    const changesMetadata = data.session_type !== undefined || data.session_title !== undefined;
    if (changesMetadata && !actor.roles.some((role) => role === 'ADMIN' || role === 'MANAGE')) {
      throw new AppError(403, 'Chỉ ADMIN hoặc MANAGE được sửa loại và tên buổi JLPT');
    }
  }

  async deleteSession(classId: number, sessionId: number, userId: number, confirmed: boolean) {
    const session = await this.getSession(classId, sessionId);
    if (session.jlpt_learning_records.length > 0) {
      throw new AppError(409, 'Không thể xóa buổi học đã có dữ liệu nhật ký JLPT');
    }
    const attendanceCount = session.attendance.length;
    if (attendanceCount > 0 && !confirmed) {
      throw new AppError(409, `Buổi học có ${attendanceCount} bản ghi điểm danh. Xác nhận để xóa toàn bộ.`);
    }
    const result = await this.repository.delete(classId, sessionId, userId);
    if (!result) throw new AppError(404, 'Không tìm thấy buổi học');
    return result;
  }
}
