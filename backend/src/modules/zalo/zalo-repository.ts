/**
 * ZaloAccount repository — Prisma access layer for ZaloAccount, ZaloContactRelation, ZaloGroup, ZaloGroupMember.
 */

import { prisma } from '../../prisma/client';
import type { Prisma, ZaloAccountStatus } from '@prisma/client';

export class ZaloRepository {
  // ─── ZaloAccount ──────────────────────────────────────────────────────

  async findById(id: number) {
    return prisma.zaloAccount.findUnique({ where: { id } });
  }

  async findByCsId(csId: number) {
    return prisma.zaloAccount.findMany({
      where: { cs_id: csId },
      orderBy: { created_at: 'desc' },
    });
  }

  async findAll() {
    return prisma.zaloAccount.findMany({
      where: { archived_at: null },
      include: { cs: { select: { id: true, name: true, email: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async findByCsIds(csIds: number[]) {
    return prisma.zaloAccount.findMany({
      where: { cs_id: { in: csIds } },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(data: { cs_id: number; display_name?: string; zalo_phone?: string }) {
    return prisma.zaloAccount.create({ data });
  }

  async updateStatus(id: number, status: ZaloAccountStatus) {
    return prisma.zaloAccount.update({
      where: { id },
      data: { status },
    });
  }

  async updateSession(id: number, data: {
    encrypted_session_data: string;
    zalo_uid?: string;
    display_name?: string;
    zalo_phone?: string;
    last_connected_at?: Date;
  }) {
    return prisma.zaloAccount.update({ where: { id }, data });
  }

  async remove(id: number) {
    // Soft-delete by setting DISABLED
    return prisma.zaloAccount.update({
      where: { id },
      data: { status: 'DISABLED', encrypted_session_data: null },
    });
  }

  // ─── ZaloContactRelation ──────────────────────────────────────────────

  async findContactRelation(studentId: number, zaloAccountId: number) {
    return prisma.zaloContactRelation.findUnique({
      where: {
        student_id_zalo_account_id: { student_id: studentId, zalo_account_id: zaloAccountId },
      },
    });
  }

  async upsertContactRelation(studentId: number, zaloAccountId: number, data: {
    relation_status?: 'FRIEND' | 'STRANGER' | 'UNKNOWN' | 'BLOCKED';
    display_name?: string;
    avatar_url?: string;
    last_checked_at?: Date;
  }) {
    return prisma.zaloContactRelation.upsert({
      where: {
        student_id_zalo_account_id: { student_id: studentId, zalo_account_id: zaloAccountId },
      },
      create: { student_id: studentId, zalo_account_id: zaloAccountId, ...data },
      update: data,
    });
  }

  async findContactsForAccount(zaloAccountId: number) {
    return prisma.zaloContactRelation.findMany({
      where: { zalo_account_id: zaloAccountId },
      include: {
        student: { select: { id: true, full_name: true, phone: true, email: true } },
      },
    });
  }

  async findFriendsForAccount(zaloAccountId: number) {
    return prisma.zaloContactRelation.findMany({
      where: {
        zalo_account_id: zaloAccountId,
        relation_status: 'FRIEND',
      },
      include: {
        student: { select: { id: true, full_name: true, phone: true, email: true } },
      },
    });
  }

  // ─── ZaloGroup ────────────────────────────────────────────────────────

  async findGroup(zaloGroupId: string) {
    return prisma.zaloGroup.findUnique({ where: { zalo_group_id: zaloGroupId } });
  }

  async upsertGroup(zaloGroupId: string, accountId: number, data: {
    name?: string;
    avatar_url?: string;
    member_count?: number;
    owner_zalo_uid?: string;
  }) {
    return prisma.zaloGroup.upsert({
      where: { zalo_group_id: zaloGroupId },
      create: { zalo_group_id: zaloGroupId, zalo_account_id: accountId, ...data },
      update: { ...data, last_synced_at: new Date() },
    });
  }

  async findGroupsForAccount(accountId: number) {
    return prisma.zaloGroup.findMany({
      where: { zalo_account_id: accountId },
      orderBy: { name: 'asc' },
    });
  }

  // ─── ZaloGroupMember ──────────────────────────────────────────────────

  async upsertGroupMember(groupId: number, zaloUid: string, data: {
    display_name?: string;
    avatar_url?: string;
  }) {
    return prisma.zaloGroupMember.upsert({
      where: { group_id_zalo_uid: { group_id: groupId, zalo_uid: zaloUid } },
      create: { group_id: groupId, zalo_uid: zaloUid, ...data },
      update: data,
    });
  }

  async getGroupMembers(groupId: number) {
    return prisma.zaloGroupMember.findMany({
      where: { group_id: groupId },
    });
  }

  async deleteGroupMembers(groupId: number) {
    await prisma.zaloGroupMember.deleteMany({ where: { group_id: groupId } });
  }
}

export const zaloRepository = new ZaloRepository();
