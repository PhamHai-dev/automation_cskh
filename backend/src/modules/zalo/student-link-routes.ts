/**
 * Student ↔ Zalo Linking Routes.
 *
 * Cho phép CS link học viên (Student) với nick Zalo (ZaloAccount) qua Friend.
 * - Q-001: Auto-suggest khi import, KHÔNG auto-link (CS phải confirm)
 * - Q-002: 1 học viên link nhiều nick (UNIQUE student_id + zalo_account_id)
 * - Q-003: CS chỉ link học viên mình (enrollment.cs_id = currentUser) + nick mình
 *
 * Mounted under /api/v1/zalo (see zalo.routes.ts).
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('StudentLinkRoutes');
const router = Router();

function getRole(req: Request): string {
  const roles: string[] = (req.user?.roles as string[]) ?? [];
  if (roles.includes('ADMIN')) return 'ADMIN';
  if (roles.includes('MANAGE')) return 'MANAGE';
  return 'CS';
}

function handleError(res: Response, err: any) {
  const status = err?.status ?? 500;
  res.status(status).json({ success: false, message: err.message ?? 'Internal error' });
}

// ─── 1. GET /zalo/students/unlinked?q=&cs_id= ───────────────────────
// List học viên CHƯA link (CS: chỉ học viên mình phụ trách)
router.get('/students/unlinked', async (req: Request, res: Response) => {
  try {
    const role = getRole(req);
    const userId = req.user!.id;
    const q = (req.query.q as string)?.trim() ?? '';
    const csIdParam = req.query.cs_id ? Number(req.query.cs_id) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

    const isAdmin = ['ADMIN', 'MANAGE'].includes(role);

    // CS scope: only enrollments where cs_id = current user
    const csWhere = isAdmin
      ? (csIdParam ? { cs_id: csIdParam } : {})
      : { cs_id: userId };

    // Students that have NO zalo_contact_relations
    const where: any = {
      enrollments: {
        some: csWhere,
      },
      zalo_contact_relations: { none: {} },
      ...(q
        ? {
            OR: [
              { full_name: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: {
          enrollments: {
            where: csWhere,
            select: {
              id: true,
              package: { select: { name: true } },
              cs: { select: { id: true, name: true } },
            },
            take: 1,
          },
        },
        orderBy: { full_name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.student.count({ where }),
    ]);

    res.json({
      success: true,
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    handleError(res, err);
  }
});

// ─── 2. GET /zalo/:accountId/students-linked ─────────────────────────
// List học viên đã link với 1 nick cụ thể
router.get('/:accountId/students-linked', async (req: Request, res: Response) => {
  try {
    const role = getRole(req);
    const userId = req.user!.id;
    const accountId = Number(req.params.accountId);
    const q = (req.query.q as string)?.trim() ?? '';

    // Verify account visibility (Q-003: CS only own nick)
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { id: true, cs_id: true },
    });
    if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
    if (role === 'CS' && account.cs_id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden — not your nick' });
    }

    const relations = await prisma.zaloContactRelation.findMany({
      where: {
        zalo_account_id: accountId,
        relation_status: 'FRIEND',
        ...(q
          ? {
              student: {
                OR: [
                  { full_name: { contains: q } },
                  { phone: { contains: q } },
                ],
              },
            }
          : {}),
      },
      include: {
        zalo_account: {
          select: {
            id: true,
            display_name: true,
            avatar_url: true,
          },
        },
        student: {
          select: {
            id: true,
            full_name: true,
            phone: true,
            email: true,
            enrollments: {
              select: {
                id: true,
                package: { select: { id: true, name: true } },
                cs: { select: { id: true, name: true } },
                enrollment_classes: {
                  take: 1,
                  orderBy: { sequence_no: 'asc' },
                  select: {
                    id: true,
                    class: {
                      select: {
                        id: true,
                        class_code: true,
                        class_name: true,
                        class_teachers: {
                          where: { active: true, role: 'MAIN' },
                          select: {
                            teacher: { select: { id: true, name: true } },
                          },
                          take: 1,
                        },
                      },
                    },
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    // ─── Enrich with Friend (Zalo person) avatar by phone match ───────────
    // ZaloContactRelation.avatar_url may be null for old links; resolve the
    // actual friend avatar so the row shows the person's Zalo profile image.
    const phoneList = relations
      .map((r) => r.student?.phone)
      .filter((p): p is string => !!p)
      .map((p) => p.replace(/\D/g, ''))
      .filter((d) => d.length >= 9)
      .map((d) => d.slice(-9));
    const friendCandidates = await prisma.friend.findMany({
      where: {
        zalo_account_id: accountId,
        OR: [
          ...(phoneList.length ? [{ phone_from_sdk: { in: phoneList } }] : []),
          ...(phoneList.length ? [{ phone_from_sdk: { in: phoneList.map((p) => '0' + p) } }] : []),
        ],
      },
      select: { zalo_uid_in_nick: true, zalo_avatar_url: true, alias_in_nick: true, zalo_display_name: true, phone_from_sdk: true },
    });
    const friendByPhone = new Map<string, (typeof friendCandidates)[number]>();
    for (const f of friendCandidates) {
      const d = (f.phone_from_sdk ?? '').replace(/\D/g, '');
      const key = d.slice(-9);
      if (key.length >= 9 && !friendByPhone.has(key)) friendByPhone.set(key, f);
    }

    const enriched = relations.map((r) => {
      const digits = (r.student?.phone ?? '').replace(/\D/g, '');
      const friend = digits.length >= 9 ? friendByPhone.get(digits.slice(-9)) : undefined;
      return {
        ...r,
        friendAvatarUrl: r.avatar_url || friend?.zalo_avatar_url || null,
        friendDisplayName:
          r.display_name ||
          friend?.alias_in_nick ||
          friend?.zalo_display_name ||
          null,
        friendZaloUid: (r as any).friend_zalo_uid || friend?.zalo_uid_in_nick || null,
      };
    });

    res.json({ success: true, items: enriched });
  } catch (err: any) {
    handleError(res, err);
  }
});

// ─── 3. GET /zalo/students/:id/links ─────────────────────────────────
// Các nick đã link của 1 học viên (Q-002: multi-nick)
router.get('/students/:id/links', async (req: Request, res: Response) => {
  try {
    const studentId = Number(req.params.id);
    const role = getRole(req);
    const userId = req.user!.id;

    // CS: verify học viên thuộc mình
    if (role === 'CS') {
      const enrollment = await prisma.enrollment.findFirst({
        where: { student_id: studentId, cs_id: userId },
        select: { id: true },
      });
      if (!enrollment) {
        return res.status(403).json({ success: false, message: 'Forbidden — not your student' });
      }
    }

    const relations = await prisma.zaloContactRelation.findMany({
      where: { student_id: studentId },
      include: {
        zalo_account: {
          select: {
            id: true,
            display_name: true,
            zalo_phone: true,
            status: true,
            cs: { select: { id: true, name: true } },
          },
        },
        student: { select: { id: true, full_name: true, phone: true } },
      },
      orderBy: { updated_at: 'desc' },
    });

    res.json({ success: true, items: relations });
  } catch (err: any) {
    handleError(res, err);
  }
});

// ─── 4. POST /zalo/links (tạo link) ──────────────────────────────────
// Body: { student_id, zalo_account_id, relation_status?, display_name? }
router.post('/links', async (req: Request, res: Response) => {
  try {
    const role = getRole(req);
    const userId = req.user!.id;

    const schema = z.object({
      student_id: z.number().int(),
      zalo_account_id: z.number().int(),
      relation_status: z.enum(['FRIEND', 'STRANGER', 'UNKNOWN', 'BLOCKED']).default('FRIEND'),
      display_name: z.string().max(200).optional(),
      friend_zalo_uid: z.string().max(64).optional(),
    });
    const dto = schema.parse(req.body);

    // Q-003 scope:
    // - CS: nick phải là của mình + học viên phải thuộc mình
    // - ADMIN/MANAGE: bất kỳ
    const account = await prisma.zaloAccount.findUnique({
      where: { id: dto.zalo_account_id },
      select: { id: true, cs_id: true },
    });
    if (!account) return res.status(404).json({ success: false, message: 'Zalo account not found' });

    if (role === 'CS') {
      if (account.cs_id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden — not your nick' });
      }
      const enrollment = await prisma.enrollment.findFirst({
        where: { student_id: dto.student_id, cs_id: userId },
        select: { id: true },
      });
      if (!enrollment) {
        return res.status(403).json({ success: false, message: 'Forbidden — not your student' });
      }
    }

    const relation = await prisma.zaloContactRelation.upsert({
      where: {
        student_id_zalo_account_id: {
          student_id: dto.student_id,
          zalo_account_id: dto.zalo_account_id,
        },
      },
      create: {
        student_id: dto.student_id,
        zalo_account_id: dto.zalo_account_id,
        relation_status: dto.relation_status,
        display_name: dto.display_name,
        friend_zalo_uid: dto.friend_zalo_uid,
        last_checked_at: new Date(),
      },
      update: {
        relation_status: dto.relation_status,
        display_name: dto.display_name,
        friend_zalo_uid: dto.friend_zalo_uid,
        last_checked_at: new Date(),
      },
    });

    // ─── Populate avatar + display_name from Friend table (best-effort) ────
    try {
      const student = await prisma.student.findUnique({
        where: { id: dto.student_id },
        select: { phone: true },
      });
      if (student?.phone) {
        const digits = student.phone.replace(/\D/g, '');
        const friend = await prisma.friend.findFirst({
          where: {
            zalo_account_id: dto.zalo_account_id,
            OR: [
              { phone_from_sdk: student.phone },
              ...(digits.length >= 9 ? [{ phone_from_sdk: { endsWith: digits.slice(-9) } }] : []),
            ],
          },
          select: { zalo_avatar_url: true, alias_in_nick: true, zalo_display_name: true, zalo_uid_in_nick: true },
        });
        if (friend) {
          await prisma.zaloContactRelation.update({
            where: { id: relation.id },
            data: {
              avatar_url: friend.zalo_avatar_url || undefined,
              display_name: relation.display_name || friend.alias_in_nick || friend.zalo_display_name || undefined,
              friend_zalo_uid: dto.friend_zalo_uid ?? friend.zalo_uid_in_nick ?? undefined,
            },
          });
          (relation as any).avatar_url = friend.zalo_avatar_url || relation.avatar_url;
          (relation as any).display_name = relation.display_name || friend.alias_in_nick || friend.zalo_display_name;
          (relation as any).friend_zalo_uid = dto.friend_zalo_uid ?? friend.zalo_uid_in_nick ?? null;
        }
      }
    } catch { /* non-critical — relation already created */ }

    log.info('Link created', {
      studentId: dto.student_id,
      zaloAccountId: dto.zalo_account_id,
      byUserId: userId,
      role,
    });

    res.status(201).json({ success: true, relation });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ success: false, errors: err.issues });
    }
    handleError(res, err);
  }
});

// ─── 5. DELETE /zalo/links/:id (xóa link) ────────────────────────────
router.delete('/links/:id', async (req: Request, res: Response) => {
  try {
    const role = getRole(req);
    const userId = req.user!.id;
    const relationId = Number(req.params.id);

    const relation = await prisma.zaloContactRelation.findUnique({
      where: { id: relationId },
      include: { zalo_account: { select: { cs_id: true } } },
    });
    if (!relation) return res.status(404).json({ success: false, message: 'Link not found' });

    if (role === 'CS') {
      if (relation.zalo_account.cs_id !== userId) {
        // CS: also allow if student belongs to them
        const enrollment = await prisma.enrollment.findFirst({
          where: { student_id: relation.student_id, cs_id: userId },
          select: { id: true },
        });
        if (!enrollment && relation.zalo_account.cs_id !== userId) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
      }
    }

    await prisma.zaloContactRelation.delete({ where: { id: relationId } });
    res.json({ success: true, message: 'Link removed' });
  } catch (err: any) {
    handleError(res, err);
  }
});

// ─── 5b. PATCH /zalo/links/:id (cập nhật link) ──────────────────────
router.patch('/links/:id', async (req: Request, res: Response) => {
  try {
    const role = getRole(req);
    const userId = req.user!.id;
    const relationId = Number(req.params.id);

    const schema = z.object({
      display_name: z.string().max(200).optional(),
      relation_status: z.enum(['FRIEND', 'STRANGER', 'UNKNOWN', 'BLOCKED']).optional(),
      new_zalo_account_id: z.number().int().optional(),
      friend_zalo_uid: z.string().max(64).optional(),
    });
    const dto = schema.parse(req.body);

    const relation = await prisma.zaloContactRelation.findUnique({
      where: { id: relationId },
      include: { zalo_account: { select: { cs_id: true } } },
    });
    if (!relation) return res.status(404).json({ success: false, message: 'Link not found' });

    // If transferring to another nick, verify the new account belongs to user (Q-003)
    if (dto.new_zalo_account_id !== undefined && dto.new_zalo_account_id !== relation.zalo_account_id) {
      const newAccount = await prisma.zaloAccount.findUnique({
        where: { id: dto.new_zalo_account_id },
        select: { id: true, cs_id: true },
      });
      if (!newAccount) return res.status(404).json({ success: false, message: 'Target Zalo account not found' });
      if (role === 'CS' && newAccount.cs_id !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden — not your nick' });
      }
    }

    if (role === 'CS') {
      if (relation.zalo_account.cs_id !== userId) {
        const enrollment = await prisma.enrollment.findFirst({
          where: { student_id: relation.student_id, cs_id: userId },
          select: { id: true },
        });
        if (!enrollment && relation.zalo_account.cs_id !== userId) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
      }
    }

    // Execute transfer in a transaction (delete old relation + upsert new one)
    const updated =
      dto.new_zalo_account_id !== undefined && dto.new_zalo_account_id !== relation.zalo_account_id
        ? await prisma.$transaction(async (tx) => {
            await tx.zaloContactRelation.delete({ where: { id: relationId } });
            return tx.zaloContactRelation.upsert({
              where: {
                student_id_zalo_account_id: {
                  student_id: relation.student_id,
                  zalo_account_id: dto.new_zalo_account_id!,
                },
              },
              create: {
                student_id: relation.student_id,
                zalo_account_id: dto.new_zalo_account_id!,
                relation_status: dto.relation_status ?? relation.relation_status,
                display_name: dto.display_name ?? relation.display_name,
                friend_zalo_uid: dto.friend_zalo_uid ?? undefined,
                last_checked_at: new Date(),
              },
              update: {
                relation_status: dto.relation_status ?? relation.relation_status,
                display_name: dto.display_name ?? relation.display_name,
                ...(dto.friend_zalo_uid !== undefined && { friend_zalo_uid: dto.friend_zalo_uid }),
                last_checked_at: new Date(),
              },
            });
          })
        : await prisma.zaloContactRelation.update({
            where: { id: relationId },
            data: {
              ...(dto.display_name !== undefined && { display_name: dto.display_name }),
              ...(dto.relation_status !== undefined && { relation_status: dto.relation_status }),
              ...(dto.friend_zalo_uid !== undefined && { friend_zalo_uid: dto.friend_zalo_uid }),
              last_checked_at: new Date(),
            },
          });

    // ─── Populate avatar from Friend table for the new target ──────────
    try {
      const student = await prisma.student.findUnique({
        where: { id: updated.student_id },
        select: { phone: true },
      });
      if (student?.phone) {
        const digits = student.phone.replace(/\D/g, '');
        const friend = await prisma.friend.findFirst({
          where: {
            zalo_account_id: updated.zalo_account_id,
            OR: [
              { phone_from_sdk: student.phone },
              ...(digits.length >= 9 ? [{ phone_from_sdk: { endsWith: digits.slice(-9) } }] : []),
            ],
          },
          select: { zalo_avatar_url: true, alias_in_nick: true, zalo_display_name: true },
        });
        if (friend) {
          await prisma.zaloContactRelation.update({
            where: { id: updated.id },
            data: {
              avatar_url: friend.zalo_avatar_url || undefined,
              display_name: updated.display_name || friend.alias_in_nick || friend.zalo_display_name || undefined,
            },
          });
          (updated as any).avatar_url = friend.zalo_avatar_url || updated.avatar_url;
        }
      }
    } catch { /* non-critical */ }

    log.info('Link updated', { relationId, byUserId: userId, role, transferTo: dto.new_zalo_account_id });

    res.json({ success: true, relation: updated });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ success: false, errors: err.issues });
    }
    handleError(res, err);
  }
});

// ─── 6. POST /zalo/auto-suggest-links ────────────────────────────────
// Phone match Student.phone ↔ Friend.phone_from_sdk
// TRẢ VỀ SUGGEST, KHÔNG auto-link (Q-001)
// Body: { zalo_account_id, cs_id? } — suggest cho nick của CS hoặc student của CS
router.post('/auto-suggest-links', async (req: Request, res: Response) => {
  try {
    const role = getRole(req);
    const userId = req.user!.id;

    const schema = z.object({
      zalo_account_id: z.number().int().optional(),
      cs_id: z.number().int().optional(),
    });
    const dto = schema.parse(req.body);

    const isAdmin = ['ADMIN', 'MANAGE'].includes(role);
    const effectiveCsId = isAdmin ? dto.cs_id ?? undefined : userId;

    // Students owned by effective CS (or all for admin)
    const studentWhere: any = effectiveCsId
      ? { enrollments: { some: { cs_id: effectiveCsId } } }
      : {};

    const students = await prisma.student.findMany({
      where: {
        ...studentWhere,
        phone: { not: null },
      },
      select: { id: true, full_name: true, phone: true },
      orderBy: { full_name: 'asc' },
    });

    // Load friends for the account (or all CS's accounts for admin)
    const accountWhere: any = dto.zalo_account_id
      ? { id: dto.zalo_account_id }
      : isAdmin
        ? {}
        : { cs_id: userId };

    const accounts = await prisma.zaloAccount.findMany({
      where: accountWhere,
      select: { id: true, display_name: true, cs_id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const friends = await prisma.friend.findMany({
      where: {
        zalo_account_id: { in: accountIds },
        phone_from_sdk: { not: null },
      },
      select: {
        zalo_uid_in_nick: true,
        alias_in_nick: true,
        phone_from_sdk: true,
        zalo_account_id: true,
      },
    });

    // Existing links to avoid re-suggesting
    const existingLinks = await prisma.zaloContactRelation.findMany({
      where: { zalo_account_id: { in: accountIds } },
      select: { student_id: true, zalo_account_id: true },
    });
    const existingKey = new Set(
      existingLinks.map((l) => `${l.student_id}:${l.zalo_account_id}`),
    );

    // Normalize phone for matching (digits only)
    const normalize = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '');

    const suggestions: Array<{
      student: { id: number; full_name: string; phone: string | null };
      friend: { zalo_uid: string; display_name: string | null; phone_from_sdk: string | null; zalo_account_id: number };
      zaloAccount: { id: number; display_name: string | null };
      alreadyLinked: boolean;
    }> = [];

    for (const student of students) {
      const studentPhone = normalize(student.phone);
      if (!studentPhone) continue;
      for (const friend of friends) {
        const friendPhone = normalize(friend.phone_from_sdk);
        if (!friendPhone) continue;
        const isMatch =
          studentPhone === friendPhone ||
          (studentPhone.length >= 10 &&
            friendPhone.length >= 10 &&
            studentPhone.slice(-9) === friendPhone.slice(-9));

        if (!isMatch) continue;
        const account = accounts.find((a) => a.id === friend.zalo_account_id);

        suggestions.push({
          student: { id: student.id, full_name: student.full_name, phone: student.phone },
          friend: {
            zalo_uid: friend.zalo_uid_in_nick,
            display_name: friend.alias_in_nick,
            phone_from_sdk: friend.phone_from_sdk,
            zalo_account_id: friend.zalo_account_id,
          },
          zaloAccount: {
            id: friend.zalo_account_id,
            display_name: account?.display_name ?? null,
          },
          alreadyLinked: existingKey.has(`${student.id}:${friend.zalo_account_id}`),
        });
      }
    }

    // Dedup by student+account
    const seen = new Set<string>();
    const unique = suggestions.filter((s) => {
      const key = `${s.student.id}:${s.friend.zalo_account_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({
      success: true,
      items: unique,
      total: unique.length,
      note: 'Auto-suggest only — confirm before linking',
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ success: false, errors: err.issues });
    }
    handleError(res, err);
  }
});

export { router as studentLinkRouter };
