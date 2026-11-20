import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma/client';
import { AuthUser } from '../../middlewares/auth.middleware';
import { AppError } from '../../middlewares/error.middleware';

export async function getAccessibleClassIds(user: AuthUser): Promise<number[] | null> {
  if (user.roles.includes('ADMIN')) {
    return null;
  }

  if (user.roles.includes('MANAGE') || user.roles.includes('CS')) {
    let allowedCsIds: number[];

    if (user.roles.includes('MANAGE')) {
      const assignments = await prisma.manageAssignment.findMany({
        where: { manage_user_id: user.id },
        include: { cs_group: { include: { members: true } } },
      });
      allowedCsIds = Array.from(
        new Set([user.id, ...assignments.flatMap((assignment) =>
          assignment.cs_group.members.map((member) => member.user_id),
        )]),
      );
    } else {
      allowedCsIds = [user.id];
    }

    const enrollmentClasses = await prisma.enrollmentClass.findMany({
      where: {
        enrollment: {
          student: { deleted_at: null },
          OR: [
            { cs_id: { in: allowedCsIds } },
            { cs_viewers: { some: { cs_id: { in: allowedCsIds } } } },
          ],
        },
      },
      select: { class_id: true },
      distinct: ['class_id'],
    });

    return enrollmentClasses.map((item) => item.class_id);
  }

  if (user.roles.includes('TEACHER')) {
    // 1. Find Teacher record associated with this user (by user_id or matching email)
    const teacher = await prisma.teacher.findFirst({
      where: {
        OR: [
          { user_id: user.id },
          ...(user.email ? [{ email: user.email }] : []),
        ],
      },
      select: { id: true },
    });

    const teacherIds: number[] = [];
    if (teacher) {
      teacherIds.push(teacher.id);
    }

    // 2. Find classes assigned to this teacher in ClassTeacher
    const classTeacherRecords = await prisma.classTeacher.findMany({
      where: {
        active: true,
        OR: [
          ...(teacherIds.length > 0 ? [{ teacher_id: { in: teacherIds } }] : []),
          { teacher: { user_id: user.id } },
          ...(user.email ? [{ teacher: { email: user.email } }] : []),
        ],
      },
      select: { class_id: true },
    });

    // 3. Also include classes where teacher is assigned to specific ClassSession
    const sessionRecords = await prisma.classSession.findMany({
      where: {
        OR: [
          ...(teacherIds.length > 0 ? [{ teacher_id: { in: teacherIds } }] : []),
          { teacher_id: user.id },
        ],
      },
      select: { class_id: true },
    });

    const classIds = new Set<number>();
    classTeacherRecords.forEach((r) => classIds.add(r.class_id));
    sessionRecords.forEach((s) => classIds.add(s.class_id));

    return Array.from(classIds);
  }

  return [];
}

/**
 * Checks if user has permission to access a specific class.
 */
export async function canAccessClass(user: AuthUser, classId: number): Promise<boolean> {
  const accessibleIds = await getAccessibleClassIds(user);
  if (accessibleIds === null) {
    return true;
  }
  return accessibleIds.includes(classId);
}

/**
 * Asserts that user can access a class; throws 403 AppError if not.
 */
export async function assertClassAccess(
  user: AuthUser,
  classId: number,
  action: string = 'truy cập lớp học này'
): Promise<void> {
  const allowed = await canAccessClass(user, classId);
  if (!allowed) {
    throw new AppError(403, `Bạn không có quyền ${action} do không được phân công phụ trách lớp này.`);
  }
}

/**
 * Express middleware to enforce class access based on req.params.classId or req.params.id
 */
export const requireClassAccess = (action: string = 'truy cập lớp học này') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized: Không tìm thấy thông tin đăng nhập' });
      }

      const rawClassId = req.params.classId || req.params.id;
      const classId = parseInt(rawClassId, 10);
      if (isNaN(classId)) {
        return res.status(400).json({ error: { code: 'INVALID_CLASS_ID', message: 'Mã lớp không hợp lệ' } });
      }

      await assertClassAccess(req.user, classId, action);
      next();
    } catch (err: any) {
      if (err.status) {
        return res.status(err.status).json({
          status: 'error',
          error: {
            code: 'FORBIDDEN_SCOPE',
            message: err.message,
          },
          message: err.message,
        });
      }
      next(err);
    }
  };
};
