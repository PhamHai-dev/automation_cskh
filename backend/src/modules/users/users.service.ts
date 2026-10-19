import { prisma } from '../../prisma/client';
import bcrypt from 'bcrypt';

export class UsersService {
  async listUsers() {
    return prisma.user.findMany({
      select: {
        id: true, name: true, email: true, staff_code: true, roles: true, active: true,
        last_login_at: true, created_at: true, updated_at: true
      }
    });
  }

  async getUser(id: number) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, staff_code: true, roles: true, active: true,
        last_login_at: true, created_at: true, updated_at: true
      }
    });
  }

  async createUser(data: any, createdById: number) {
    const password_hash = await bcrypt.hash(data.password, 10);
    return prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        staff_code: data.staff_code ? String(data.staff_code).trim().toUpperCase() : null,
        roles: data.roles,
        password_hash,
        created_by_id: createdById,
      },
      select: { id: true, email: true, name: true, staff_code: true, roles: true }
    });
  }

  async updateUser(id: number, data: any) {
    const updatePayload: any = { ...data };
    if (data.staff_code !== undefined) {
      updatePayload.staff_code = data.staff_code ? String(data.staff_code).trim().toUpperCase() : null;
    }
    return prisma.user.update({
      where: { id },
      data: updatePayload,
      select: { id: true, email: true, name: true, staff_code: true, roles: true, active: true }
    });
  }

  async enableUser(id: number) {
    return prisma.user.update({
      where: { id },
      data: { active: true },
      select: { id: true, active: true }
    });
  }

  async disableUser(id: number) {
    // Disable user and revoke all active sessions
    await prisma.authSession.updateMany({
      where: { user_id: id, revoked_at: null },
      data: { revoked_at: new Date() }
    });
    return prisma.user.update({
      where: { id },
      data: { active: false },
      select: { id: true, active: true }
    });
  }

  async revokeSessions(id: number) {
    return prisma.authSession.updateMany({
      where: { user_id: id, revoked_at: null },
      data: { revoked_at: new Date() }
    });
  }
}
