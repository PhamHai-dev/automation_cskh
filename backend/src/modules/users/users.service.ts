import { prisma } from '../../prisma/client';
import bcrypt from 'bcrypt';

/**
 * Normalize a CS code into `CVHT` + zero-padded 2+ digit number (e.g. "CVHT1" -> "CVHT01").
 * Also supports extracting `CVHT01` from strings like "Trần Thị Hải Yến - CVHT01".
 */
export function normalizeCsCode(raw?: string | null): string | null {
  if (!raw) return null;
  const match = raw.toUpperCase().match(/CVHT[-_\s]*(\d+)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (!Number.isFinite(num) || num <= 0) return null;
  return `CVHT${String(num).padStart(2, '0')}`;
}

/**
 * Format display name for CS user: "Trần Thị Hải Yến - CVHT01"
 */
export function formatCsDisplayName(name?: string | null, code?: string | null): string {
  const cleanName = (name || '').trim();
  const cleanCode = (code || '').trim();
  if (cleanName && cleanCode) {
    if (cleanName.toUpperCase().includes(cleanCode.toUpperCase())) {
      return cleanName;
    }
    return `${cleanName} - ${cleanCode}`;
  }
  return cleanName || cleanCode || '';
}

export class UsersService {
  /**
   * Generate the next sequential `CVHTxx` code starting from `CVHT01`.
   */
  async generateNextCsCode(): Promise<string> {
    const existingUsers = await prisma.user.findMany({
      where: {
        code: { startsWith: 'CVHT' },
      },
      select: { code: true },
    });

    let maxNum = 0;
    for (const u of existingUsers) {
      if (!u.code) continue;
      const m = u.code.toUpperCase().match(/^CVHT(\d+)$/);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val > maxNum) maxNum = val;
      }
    }

    const nextNum = maxNum + 1;
    return `CVHT${String(nextNum).padStart(2, '0')}`;
  }

  /**
   * Ensure all existing users with role 'CS' have a valid `CVHTxx` code assigned.
   */
  async ensureCsUsersHaveCodes(): Promise<void> {
    const allUsers = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, code: true, roles: true },
    });

    for (const u of allUsers) {
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      if (roles.includes('CS') && !u.code) {
        const nextCode = await this.generateNextCsCode();
        await prisma.user.update({
          where: { id: u.id },
          data: { code: nextCode },
        });
      }
    }
  }

  async listUsers() {
    await this.ensureCsUsersHaveCodes();
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        phone: true,
        roles: true,
        active: true,
        last_login_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    return users.map((u) => {
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      const displayLabel = roles.includes('CS')
        ? formatCsDisplayName(u.name, u.code)
        : u.name || u.email;
      return {
        ...u,
        display_label: displayLabel,
      };
    });
  }

  async getUser(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        phone: true,
        roles: true,
        active: true,
        last_login_at: true,
        created_at: true,
        updated_at: true,
      },
    });
    if (!user) return null;
    const roles = Array.isArray(user.roles) ? (user.roles as string[]) : [];
    return {
      ...user,
      display_label: roles.includes('CS')
        ? formatCsDisplayName(user.name, user.code)
        : user.name || user.email,
    };
  }

  async createUser(data: any, createdById: number) {
    const password_hash = await bcrypt.hash(data.password, 10);
    const roles: string[] = Array.isArray(data.roles) ? data.roles : [];

    // Strip "- CVHTxx" from name if user typed "Trần Thị Hải Yến - CVHT01" into the name field
    let cleanName = String(data.name || '').trim();
    const extractedCodeFromName = normalizeCsCode(cleanName);
    if (extractedCodeFromName) {
      cleanName = cleanName.replace(/\s*-\s*CVHT[-_\s]*\d+\s*$/i, '').trim() || cleanName;
    }

    let code: string | null = normalizeCsCode(data.code) || extractedCodeFromName;
    if (roles.includes('CS') && !code) {
      code = await this.generateNextCsCode();
    } else if (!roles.includes('CS') && data.code) {
      code = String(data.code).trim();
    }

    // Avoid unique collision if code was manually specified
    if (code) {
      const existing = await prisma.user.findUnique({ where: { code } });
      if (existing) {
        code = await this.generateNextCsCode();
      }
    }

    const created = await prisma.user.create({
      data: {
        code,
        email: data.email,
        name: cleanName,
        phone: data.phone ? String(data.phone).trim() : null,
        roles,
        password_hash,
        created_by_id: createdById,
      },
      select: { id: true, code: true, email: true, name: true, phone: true, roles: true, active: true },
    });

    return {
      ...created,
      display_label: roles.includes('CS')
        ? formatCsDisplayName(created.name, created.code)
        : created.name || created.email,
    };
  }

  async updateUser(id: number, data: any) {
    const existing = await prisma.user.findUnique({ where: { id } });
    const roles: string[] = Array.isArray(data.roles)
      ? data.roles
      : Array.isArray(existing?.roles)
        ? (existing!.roles as string[])
        : [];

    const updatePayload: any = {};
    if (data.name !== undefined) {
      let cleanName = String(data.name).trim();
      const extracted = normalizeCsCode(cleanName);
      if (extracted) {
        cleanName = cleanName.replace(/\s*-\s*CVHT[-_\s]*\d+\s*$/i, '').trim() || cleanName;
        if (!data.code) data.code = extracted;
      }
      updatePayload.name = cleanName;
    }
    if (data.phone !== undefined) {
      updatePayload.phone = data.phone ? String(data.phone).trim() : null;
    }
    if (data.roles !== undefined) {
      updatePayload.roles = data.roles;
    }

    if (data.code !== undefined) {
      updatePayload.code = roles.includes('CS')
        ? normalizeCsCode(data.code) || String(data.code).trim() || null
        : String(data.code).trim() || null;
    } else if (roles.includes('CS') && !existing?.code) {
      updatePayload.code = await this.generateNextCsCode();
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updatePayload,
      select: { id: true, code: true, email: true, name: true, phone: true, roles: true, active: true },
    });

    return {
      ...updated,
      display_label: roles.includes('CS')
        ? formatCsDisplayName(updated.name, updated.code)
        : updated.name || updated.email,
    };
  }

  async enableUser(id: number) {
    return prisma.user.update({
      where: { id },
      data: { active: true },
      select: { id: true, code: true, active: true },
    });
  }

  async disableUser(id: number) {
    // Disable user and revoke all active sessions
    await prisma.authSession.updateMany({
      where: { user_id: id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return prisma.user.update({
      where: { id },
      data: { active: false },
      select: { id: true, code: true, active: true },
    });
  }

  async revokeSessions(id: number) {
    return prisma.authSession.updateMany({
      where: { user_id: id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }
}
