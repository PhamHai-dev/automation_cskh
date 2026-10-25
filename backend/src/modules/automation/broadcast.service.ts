/**
 * Multi-Channel Broadcast & Scheduled Campaign Engine (Zalo & LINE).
 *
 * Supports:
 *   - Immediate & Scheduled broadcast campaigns (`IMMEDIATE` | `SCHEDULED`)
 *   - Flexible target selectors:
 *       1. Students (`student_ids`) — auto-resolves linked Zalo Care Group / Zalo Friend
 *          and/or LINE Care Group / LINE Friend according to `channel_mode` (`AUTO`, `ZALO_ONLY`, `LINE_ONLY`, `BOTH`),
 *          and renders personalized template variables (`{{student_name}}`, `{{class_name}}`, etc.)
 *       2. Zalo Groups (`zalo_group_ids`) — sends directly to selected Zalo groups
 *       3. LINE Groups (`line_group_ids`) — sends directly to selected LINE groups
 *       4. Direct Targets (`direct_targets`) — arbitrary Zalo/LINE UID or Group IDs
 *   - Anti-ban staggered pacing & rate limit enforcement (`zaloRateLimiter`)
 *   - Real-time Socket.IO progress (`broadcast:progress`, `broadcast:completed`)
 *   - 15-second scheduled poller (`processDueScheduledCampaigns`)
 */

import crypto from 'crypto';
import type { BroadcastCampaignStatus, BroadcastTargetType, MessageDeliveryStatus } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { render, type TemplateVars } from './automation-renderer';
import {
  buildZaloSendPayload,
  parseAndCompileRichText,
} from './rich-message.compiler';
import { zaloPool } from '../zalo/zalo-pool';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter';
import {
  getLineDeliveryDispatcher,
  type RichMessageMetadata,
} from '../line/line-dispatcher.contract';
import { getIo } from '../../shared/realtime/socket-singleton';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('BroadcastService');

export type BroadcastChannelMode = 'AUTO' | 'ZALO_ONLY' | 'LINE_ONLY' | 'BOTH';
export type BroadcastScheduleType = 'IMMEDIATE' | 'SCHEDULED';

export interface DirectBroadcastTarget {
  platform: 'ZALO' | 'LINE';
  account_id: number;
  external_target_id: string;
  target_type?: 'GROUP' | 'USER';
  display_name?: string;
}

export interface CreateBroadcastCampaignInput {
  name: string;
  description?: string | null;
  message_content: string;
  message_metadata?: RichMessageMetadata | null;
  channel_mode?: BroadcastChannelMode;
  schedule_type?: BroadcastScheduleType;
  scheduled_at?: string | Date | null;
  student_ids?: number[];
  zalo_group_ids?: number[];
  line_group_ids?: number[];
  direct_targets?: DirectBroadcastTarget[];
  awaitExecution?: boolean;
}

export interface ListBroadcastCampaignsQuery {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface PendingRecipientDraft {
  target_type: BroadcastTargetType;
  platform: 'ZALO' | 'LINE';
  student_id: number | null;
  zalo_account_id: number | null;
  zalo_group_id: number | null;
  line_account_id: number | null;
  line_group_id: number | null;
  external_target_id: string | null;
  target_display_name: string | null;
  rendered_content: string;
  rendered_metadata?: RichMessageMetadata | null;
  status: MessageDeliveryStatus;
  error_message: string | null;
}

function buildLineBroadcastRetryKey(recipientId: number): string {
  const hash = crypto
    .createHash('sha256')
    .update(`edura:line:broadcast:recipient:${recipientId}`)
    .digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BroadcastService {
  private isPollingScheduled = false;
  private activeCampaignRuns = new Set<number>();

  /**
   * Render template variables and compile inline rich markup + explicit styles
   * into `cleanText` and per-recipient `renderedMetadata`.
   */
  private compileRecipientMessage(
    rawTemplate: string,
    vars: TemplateVars,
    baseMetadata?: RichMessageMetadata | null,
  ): { cleanText: string; renderedMetadata: RichMessageMetadata | null } {
    const renderedRaw = render(rawTemplate, vars);
    const { cleanText, styles } = parseAndCompileRichText(renderedRaw, baseMetadata?.styles);

    const hasBaseMeta =
      Boolean(baseMetadata) &&
      (baseMetadata!.urgency === 1 ||
        baseMetadata!.urgency === 2 ||
        (Array.isArray(baseMetadata!.attachments) && baseMetadata!.attachments.length > 0) ||
        (Array.isArray(baseMetadata!.links) && baseMetadata!.links.length > 0) ||
        (Array.isArray(baseMetadata!.flexMessages) && baseMetadata!.flexMessages.length > 0));

    const renderedMetadata: RichMessageMetadata | null =
      hasBaseMeta || styles.length > 0
        ? {
            ...(baseMetadata ?? {}),
            ...(styles.length > 0 ? { styles } : {}),
          }
        : null;

    return { cleanText, renderedMetadata };
  }

  /**
   * Build template variables for a student from their latest active enrollment.
   */
  private extractStudentTemplateVars(student: any): TemplateVars {
    const enrollments: any[] = Array.isArray(student.enrollments) ? student.enrollments : [];
    const activeEnrollment =
      enrollments.find((e) =>
        ['STUDYING', 'WAITING_CLASS', 'UPCOMING', 'NOT_STARTED'].includes(e.status),
      ) ?? enrollments[0];

    const firstEnrollmentClass = activeEnrollment?.enrollment_classes?.[0];
    const classObj = firstEnrollmentClass?.class;
    const teacherName = classObj?.class_teachers?.[0]?.teacher?.name ?? '';
    const packageName =
      activeEnrollment?.package?.name ?? activeEnrollment?.package?.code ?? '';
    const remainingSessions =
      activeEnrollment?.external_remaining_sessions ??
      activeEnrollment?.total_sessions ??
      '';
    const csName = activeEnrollment?.cs?.name ?? '';

    return {
      student_name: student.full_name ?? '',
      student_phone: student.phone ?? '',
      class_name: classObj?.class_name ?? '',
      enrollment_package: packageName,
      remaining_sessions: remainingSessions,
      cs_name: csName,
      teacher_name: teacherName,
    };
  }

  /**
   * Resolve best Zalo target (Care Group or Personal Friend) for a student.
   */
  private async resolveStudentZaloTarget(
    student: any,
    preferredCsId?: number,
  ): Promise<{
    zaloAccountId: number;
    zaloGroupId: number | null;
    externalTargetId: string;
    displayName: string;
    isCareGroup: boolean;
  } | null> {
    let relations: any[] = Array.isArray(student.zalo_contact_relations)
      ? student.zalo_contact_relations
      : [];

    if (!Array.isArray(student.zalo_contact_relations) && prisma.zaloContactRelation?.findMany) {
      relations = await prisma.zaloContactRelation.findMany({
        where: { student_id: student.id, relation_status: 'FRIEND' },
        include: {
          zalo_account: { select: { id: true, cs_id: true, display_name: true, status: true } },
          zalo_group: { select: { id: true, zalo_group_id: true, name: true, zalo_account_id: true } },
        },
      });
    }

    const validRelations = relations.filter(
      (r) =>
        r.relation_status === 'FRIEND' ||
        r.zalo_group_id != null ||
        r.target_type === 'GROUP' ||
        Boolean(r.friend_zalo_uid),
    );

    if (validRelations.length === 0) {
      return null;
    }

    // Score relations: prefer Care Group + ACTIVE account + preferred CS owner
    const scored = validRelations
      .map((r) => {
        let score = 0;
        const isGroup = r.target_type === 'GROUP' || r.zalo_group_id != null || Boolean(r.zalo_group?.zalo_group_id);
        if (isGroup) score += 100;
        if (!r.zalo_account || r.zalo_account.status === 'ACTIVE') score += 50;
        if (preferredCsId && r.zalo_account?.cs_id === preferredCsId) score += 20;
        return { relation: r, score, isGroup };
      })
      .sort((a, b) => b.score - a.score);

    for (const candidate of scored) {
      const r = candidate.relation;
      if (candidate.isGroup) {
        let externalGroupId: string | null = r.zalo_group?.zalo_group_id ?? r.friend_zalo_uid ?? null;
        let zaloGroupId: number | null = r.zalo_group_id ?? r.zalo_group?.id ?? null;
        let zaloAccountId: number | null = r.zalo_account_id ?? r.zalo_group?.zalo_account_id ?? null;
        let groupName: string | null = r.zalo_group?.name ?? r.display_name ?? null;

        if (!externalGroupId && zaloGroupId && prisma.zaloGroup?.findUnique) {
          const grp = await prisma.zaloGroup.findUnique({
            where: { id: zaloGroupId },
            select: { id: true, zalo_group_id: true, name: true, zalo_account_id: true },
          });
          if (grp) {
            externalGroupId = grp.zalo_group_id;
            zaloAccountId = zaloAccountId ?? grp.zalo_account_id;
            groupName = groupName ?? grp.name;
          }
        }

        if (externalGroupId && zaloAccountId) {
          return {
            zaloAccountId,
            zaloGroupId,
            externalTargetId: externalGroupId,
            displayName: groupName
              ? `${student.full_name} (${groupName})`
              : student.full_name,
            isCareGroup: true,
          };
        }
      } else {
        const externalUid = r.friend_zalo_uid ?? student.zalo_uid ?? null;
        if (externalUid && r.zalo_account_id) {
          return {
            zaloAccountId: r.zalo_account_id,
            zaloGroupId: null,
            externalTargetId: externalUid,
            displayName: r.display_name
              ? `${student.full_name} (${r.display_name})`
              : student.full_name,
            isCareGroup: false,
          };
        }
      }
    }

    return null;
  }

  /**
   * Resolve best LINE target (Care Group or Personal Follower) for a student.
   */
  private async resolveStudentLineTarget(
    student: any,
    preferredCsId?: number,
  ): Promise<{
    lineAccountId: number;
    lineGroupId: number | null;
    externalTargetId: string;
    displayName: string;
    isCareGroup: boolean;
  } | null> {
    let relations: any[] = Array.isArray(student.line_contact_relations)
      ? student.line_contact_relations
      : [];

    if (!Array.isArray(student.line_contact_relations) && prisma.lineContactRelation?.findMany) {
      relations = await prisma.lineContactRelation.findMany({
        where: { student_id: student.id, relation_status: 'FRIEND' },
        include: {
          line_account: {
            select: { id: true, cs_id: true, display_name: true, status: true, account_type: true },
          },
          line_group: {
            select: { id: true, line_group_id: true, name: true, line_account_id: true },
          },
        },
      });
    }

    const validRelations = relations.filter(
      (r) =>
        r.relation_status === 'FRIEND' ||
        r.line_group_id != null ||
        r.target_type === 'GROUP' ||
        Boolean(r.friend_line_uid),
    );

    const scored = validRelations
      .map((r) => {
        let score = 0;
        const isGroup =
          r.target_type === 'GROUP' ||
          r.line_group_id != null ||
          Boolean(r.line_group?.line_group_id) ||
          Boolean(
            r.friend_line_uid &&
              (r.friend_line_uid.startsWith('C') || r.friend_line_uid.startsWith('c')),
          );
        if (isGroup) score += 100;
        if (!r.line_account || r.line_account.status === 'ACTIVE') score += 50;
        if (preferredCsId && r.line_account?.cs_id === preferredCsId) score += 25;
        if (r.line_account?.account_type === 'OA') score += 10;
        return { relation: r, score, isGroup };
      })
      .sort((a, b) => b.score - a.score);

    for (const candidate of scored) {
      const r = candidate.relation;
      if (candidate.isGroup) {
        let externalGroupId: string | null =
          r.line_group?.line_group_id ?? r.friend_line_uid ?? null;
        let lineGroupId: number | null = r.line_group_id ?? r.line_group?.id ?? null;
        let lineAccountId: number | null =
          r.line_account_id ?? r.line_group?.line_account_id ?? null;
        let groupName: string | null = r.line_group?.name ?? r.display_name ?? null;

        if (!externalGroupId && lineGroupId && prisma.lineGroup?.findUnique) {
          const grp = await prisma.lineGroup.findUnique({
            where: { id: lineGroupId },
            select: { id: true, line_group_id: true, name: true, line_account_id: true },
          });
          if (grp) {
            externalGroupId = grp.line_group_id;
            lineAccountId = lineAccountId ?? grp.line_account_id;
            groupName = groupName ?? grp.name;
          }
        }

        if (externalGroupId && lineAccountId) {
          return {
            lineAccountId,
            lineGroupId,
            externalTargetId: externalGroupId,
            displayName: groupName
              ? `${student.full_name} (${groupName})`
              : student.full_name,
            isCareGroup: true,
          };
        }
      } else {
        const externalUid = r.friend_line_uid ?? student.line_uid ?? null;
        if (externalUid && r.line_account_id) {
          return {
            lineAccountId: r.line_account_id,
            lineGroupId: null,
            externalTargetId: externalUid,
            displayName: r.display_name
              ? `${student.full_name} (${r.display_name})`
              : student.full_name,
            isCareGroup: false,
          };
        }
      }
    }

    // Fallback: direct student.line_uid + any active LINE OA account
    const directLineUid = student.line_uid?.trim();
    if (directLineUid && prisma.lineAccount?.findFirst) {
      const activeAccount = await prisma.lineAccount.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { account_type: 'asc' },
        select: { id: true },
      });
      if (activeAccount) {
        const isGroupUid = directLineUid.startsWith('C') || directLineUid.startsWith('c');
        return {
          lineAccountId: activeAccount.id,
          lineGroupId: null,
          externalTargetId: directLineUid,
          displayName: student.full_name,
          isCareGroup: isGroupUid,
        };
      }
    }

    return null;
  }

  /**
   * Create a Broadcast Campaign (IMMEDIATE or SCHEDULED), resolving all target selectors
   * and rendering template variables per recipient.
   */
  async createCampaign(input: CreateBroadcastCampaignInput, userId: number) {
    const name = input.name?.trim();
    if (!name) {
      throw Object.assign(new Error('Tên chiến dịch không được để trống'), { status: 422 });
    }
    const messageContent = input.message_content?.trim();
    if (!messageContent) {
      throw Object.assign(new Error('Nội dung tin nhắn không được để trống'), { status: 422 });
    }

    const channelMode: BroadcastChannelMode = input.channel_mode ?? 'AUTO';
    const scheduleType: BroadcastScheduleType = input.schedule_type ?? 'IMMEDIATE';

    let scheduledAtDate: Date | null = null;
    if (scheduleType === 'SCHEDULED') {
      if (!input.scheduled_at) {
        throw Object.assign(new Error('Vui lòng chọn thời gian hẹn lịch gửi (scheduled_at)'), {
          status: 422,
        });
      }
      scheduledAtDate =
        input.scheduled_at instanceof Date ? input.scheduled_at : new Date(input.scheduled_at);
      if (isNaN(scheduledAtDate.getTime())) {
        throw Object.assign(new Error('Thời gian hẹn lịch gửi không hợp lệ'), { status: 422 });
      }
    }

    const studentIds = Array.from(new Set(input.student_ids ?? []));
    const zaloGroupIds = Array.from(new Set(input.zalo_group_ids ?? []));
    const lineGroupIds = Array.from(new Set(input.line_group_ids ?? []));
    const directTargets = input.direct_targets ?? [];

    if (
      studentIds.length === 0 &&
      zaloGroupIds.length === 0 &&
      lineGroupIds.length === 0 &&
      directTargets.length === 0
    ) {
      throw Object.assign(
        new Error(
          'Vui lòng chọn ít nhất 1 đối tượng nhận tin (Học viên, Nhóm Zalo, Nhóm LINE hoặc Đích trực tiếp)',
        ),
        { status: 422 },
      );
    }

    const recipientDrafts: PendingRecipientDraft[] = [];

    // 1. Resolve Student Targets
    if (studentIds.length > 0) {
      const students = await prisma.student.findMany({
        where: { id: { in: studentIds } },
        include: {
          enrollments: {
            orderBy: { updated_at: 'desc' },
            include: {
              package: { select: { id: true, code: true, name: true } },
              cs: { select: { id: true, name: true } },
              enrollment_classes: {
                include: {
                  class: {
                    select: {
                      id: true,
                      class_name: true,
                      class_teachers: {
                        include: { teacher: { select: { id: true, name: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
          zalo_contact_relations: {
            include: {
              zalo_account: {
                select: { id: true, cs_id: true, display_name: true, status: true },
              },
              zalo_group: {
                select: { id: true, zalo_group_id: true, name: true, zalo_account_id: true },
              },
            },
          },
          line_contact_relations: {
            include: {
              line_account: {
                select: {
                  id: true,
                  cs_id: true,
                  display_name: true,
                  status: true,
                  account_type: true,
                },
              },
              line_group: {
                select: { id: true, line_group_id: true, name: true, line_account_id: true },
              },
            },
          },
        },
      });

      const studentMap = new Map<number, any>(students.map((s: any) => [s.id, s]));

      for (const sid of studentIds) {
        const student = studentMap.get(sid);
        if (!student) continue;

        const vars = this.extractStudentTemplateVars(student);
        const { cleanText: renderedContent, renderedMetadata } =
          this.compileRecipientMessage(messageContent, vars, input.message_metadata);
        const preferredCsId = student.enrollments?.[0]?.cs?.id ?? userId;

        const zaloTarget =
          channelMode === 'LINE_ONLY'
            ? null
            : await this.resolveStudentZaloTarget(student, preferredCsId);
        const lineTarget =
          channelMode === 'ZALO_ONLY'
            ? null
            : await this.resolveStudentLineTarget(student, preferredCsId);

        let addedForStudent = 0;

        if (channelMode === 'ZALO_ONLY') {
          if (zaloTarget) {
            recipientDrafts.push({
              target_type: 'STUDENT',
              platform: 'ZALO',
              student_id: student.id,
              zalo_account_id: zaloTarget.zaloAccountId,
              zalo_group_id: zaloTarget.zaloGroupId,
              line_account_id: null,
              line_group_id: null,
              external_target_id: zaloTarget.externalTargetId,
              target_display_name: zaloTarget.displayName,
              rendered_content: renderedContent,
              rendered_metadata: renderedMetadata,
              status: 'SCHEDULED',
              error_message: null,
            });
            addedForStudent++;
          }
        } else if (channelMode === 'LINE_ONLY') {
          if (lineTarget) {
            recipientDrafts.push({
              target_type: 'STUDENT',
              platform: 'LINE',
              student_id: student.id,
              zalo_account_id: null,
              zalo_group_id: null,
              line_account_id: lineTarget.lineAccountId,
              line_group_id: lineTarget.lineGroupId,
              external_target_id: lineTarget.externalTargetId,
              target_display_name: lineTarget.displayName,
              rendered_content: renderedContent,
              rendered_metadata: renderedMetadata,
              status: 'SCHEDULED',
              error_message: null,
            });
            addedForStudent++;
          }
        } else if (channelMode === 'BOTH') {
          if (zaloTarget) {
            recipientDrafts.push({
              target_type: 'STUDENT',
              platform: 'ZALO',
              student_id: student.id,
              zalo_account_id: zaloTarget.zaloAccountId,
              zalo_group_id: zaloTarget.zaloGroupId,
              line_account_id: null,
              line_group_id: null,
              external_target_id: zaloTarget.externalTargetId,
              target_display_name: zaloTarget.displayName,
              rendered_content: renderedContent,
              rendered_metadata: renderedMetadata,
              status: 'SCHEDULED',
              error_message: null,
            });
            addedForStudent++;
          }
          if (lineTarget) {
            recipientDrafts.push({
              target_type: 'STUDENT',
              platform: 'LINE',
              student_id: student.id,
              zalo_account_id: null,
              zalo_group_id: null,
              line_account_id: lineTarget.lineAccountId,
              line_group_id: lineTarget.lineGroupId,
              external_target_id: lineTarget.externalTargetId,
              target_display_name: lineTarget.displayName,
              rendered_content: renderedContent,
              rendered_metadata: renderedMetadata,
              status: 'SCHEDULED',
              error_message: null,
            });
            addedForStudent++;
          }
        } else {
          // AUTO: Prefer Care Group (Zalo Care Group -> LINE Care Group -> Zalo Friend -> LINE Friend)
          const pickZalo =
            zaloTarget &&
            (!lineTarget || zaloTarget.isCareGroup || !lineTarget.isCareGroup);

          if (pickZalo && zaloTarget) {
            recipientDrafts.push({
              target_type: 'STUDENT',
              platform: 'ZALO',
              student_id: student.id,
              zalo_account_id: zaloTarget.zaloAccountId,
              zalo_group_id: zaloTarget.zaloGroupId,
              line_account_id: null,
              line_group_id: null,
              external_target_id: zaloTarget.externalTargetId,
              target_display_name: zaloTarget.displayName,
              rendered_content: renderedContent,
              rendered_metadata: renderedMetadata,
              status: 'SCHEDULED',
              error_message: null,
            });
            addedForStudent++;
          } else if (lineTarget) {
            recipientDrafts.push({
              target_type: 'STUDENT',
              platform: 'LINE',
              student_id: student.id,
              zalo_account_id: null,
              zalo_group_id: null,
              line_account_id: lineTarget.lineAccountId,
              line_group_id: lineTarget.lineGroupId,
              external_target_id: lineTarget.externalTargetId,
              target_display_name: lineTarget.displayName,
              rendered_content: renderedContent,
              rendered_metadata: renderedMetadata,
              status: 'SCHEDULED',
              error_message: null,
            });
            addedForStudent++;
          }
        }

        if (addedForStudent === 0) {
          recipientDrafts.push({
            target_type: 'STUDENT',
            platform: channelMode === 'LINE_ONLY' ? 'LINE' : 'ZALO',
            student_id: student.id,
            zalo_account_id: null,
            zalo_group_id: null,
            line_account_id: null,
            line_group_id: null,
            external_target_id: null,
            target_display_name: student.full_name,
            rendered_content: renderedContent,
            rendered_metadata: renderedMetadata,
            status: 'SKIPPED_NOT_FRIEND',
            error_message: 'Học viên chưa gắn Nhóm/Tài khoản Zalo hoặc LINE',
          });
        }
      }
    }

    // 2. Resolve Zalo Group Targets
    if (zaloGroupIds.length > 0) {
      const zaloGroups = await prisma.zaloGroup.findMany({
        where: { id: { in: zaloGroupIds } },
      });
      const groupMap = new Map<number, any>(zaloGroups.map((g: any) => [g.id, g]));

      for (const gid of zaloGroupIds) {
        const group = groupMap.get(gid);
        if (!group) continue;
        const { cleanText: renderedContent, renderedMetadata } =
          this.compileRecipientMessage(
            messageContent,
            {
              student_name: group.name ?? '',
              student_phone: '',
              class_name: group.name ?? '',
              enrollment_package: '',
              remaining_sessions: '',
              cs_name: '',
              teacher_name: '',
            },
            input.message_metadata,
          );
        recipientDrafts.push({
          target_type: 'ZALO_GROUP',
          platform: 'ZALO',
          student_id: null,
          zalo_account_id: group.zalo_account_id,
          zalo_group_id: group.id,
          line_account_id: null,
          line_group_id: null,
          external_target_id: group.zalo_group_id,
          target_display_name: group.name ?? `Nhóm Zalo #${group.id}`,
          rendered_content: renderedContent,
          rendered_metadata: renderedMetadata,
          status: 'SCHEDULED',
          error_message: null,
        });
      }
    }

    // 3. Resolve LINE Group Targets
    if (lineGroupIds.length > 0) {
      const lineGroups = await prisma.lineGroup.findMany({
        where: { id: { in: lineGroupIds } },
      });
      const groupMap = new Map<number, any>(lineGroups.map((g: any) => [g.id, g]));

      for (const gid of lineGroupIds) {
        const group = groupMap.get(gid);
        if (!group) continue;
        const { cleanText: renderedContent, renderedMetadata } =
          this.compileRecipientMessage(
            messageContent,
            {
              student_name: group.name ?? '',
              student_phone: '',
              class_name: group.name ?? '',
              enrollment_package: '',
              remaining_sessions: '',
              cs_name: '',
              teacher_name: '',
            },
            input.message_metadata,
          );
        recipientDrafts.push({
          target_type: 'LINE_GROUP',
          platform: 'LINE',
          student_id: null,
          zalo_account_id: null,
          zalo_group_id: null,
          line_account_id: group.line_account_id,
          line_group_id: group.id,
          external_target_id: group.line_group_id,
          target_display_name: group.name ?? `Nhóm LINE #${group.id}`,
          rendered_content: renderedContent,
          rendered_metadata: renderedMetadata,
          status: 'SCHEDULED',
          error_message: null,
        });
      }
    }

    // 4. Resolve Direct Targets
    for (const dt of directTargets) {
      const isGroup =
        dt.target_type === 'GROUP' ||
        (dt.platform === 'LINE' &&
          (dt.external_target_id.startsWith('C') || dt.external_target_id.startsWith('c')));

      const targetType: BroadcastTargetType =
        dt.platform === 'ZALO'
          ? isGroup
            ? 'ZALO_GROUP'
            : 'ZALO_USER'
          : isGroup
            ? 'LINE_GROUP'
            : 'LINE_USER';

      const { cleanText: renderedContent, renderedMetadata } =
        this.compileRecipientMessage(
          messageContent,
          {
            student_name: dt.display_name ?? '',
            student_phone: '',
            class_name: dt.display_name ?? '',
            enrollment_package: '',
            remaining_sessions: '',
            cs_name: '',
            teacher_name: '',
          },
          input.message_metadata,
        );

      recipientDrafts.push({
        target_type: targetType,
        platform: dt.platform,
        student_id: null,
        zalo_account_id: dt.platform === 'ZALO' ? dt.account_id : null,
        zalo_group_id: null,
        line_account_id: dt.platform === 'LINE' ? dt.account_id : null,
        line_group_id: null,
        external_target_id: dt.external_target_id,
        target_display_name: dt.display_name ?? dt.external_target_id,
        rendered_content: renderedContent,
        rendered_metadata: renderedMetadata,
        status: 'SCHEDULED',
        error_message: null,
      });
    }

    const totalRecipients = recipientDrafts.length;
    const skippedCount = recipientDrafts.filter((r) => r.status.startsWith('SKIPPED_')).length;
    const initialStatus: BroadcastCampaignStatus =
      scheduleType === 'IMMEDIATE' ? 'SENDING' : 'SCHEDULED';

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        name,
        description: input.description ?? null,
        message_content: messageContent,
        ...(input.message_metadata !== undefined
          ? { message_metadata: input.message_metadata as any }
          : {}),
        channel_mode: channelMode,
        schedule_type: scheduleType,
        scheduled_at: scheduledAtDate,
        started_at: scheduleType === 'IMMEDIATE' ? new Date() : null,
        status: initialStatus,
        total_recipients: totalRecipients,
        sent_count: 0,
        failed_count: 0,
        skipped_count: skippedCount,
        created_by_id: userId,
        recipients: {
          create: recipientDrafts as any,
        },
      },
      include: {
        recipients: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (scheduleType === 'IMMEDIATE') {
      if (input.awaitExecution || process.env.NODE_ENV === 'test') {
        const executed = await this.executeCampaign(campaign.id);
        return executed ?? campaign;
      } else {
        this.executeCampaign(campaign.id).catch((err) => {
          log.error('Background executeCampaign failed', {
            campaignId: campaign.id,
            error: err?.message ?? String(err),
          });
        });
      }
    }

    return campaign;
  }

  /**
   * Execute a Broadcast Campaign:
   *   - Loads pending recipients (`SCHEDULED`, `QUEUED`)
   *   - Applies staggered anti-ban pacing between consecutive messages on the same account
   *   - Dispatches Zalo messages via `zaloPool` + `zaloRateLimiter`
   *   - Dispatches LINE messages via `getLineDeliveryDispatcher()`
   *   - Emits `broadcast:progress` and `broadcast:completed` Socket.IO events
   */
  async executeCampaign(campaignId: number) {
    if (this.activeCampaignRuns.has(campaignId)) {
      log.info('Campaign is already executing — skipping duplicate trigger', { campaignId });
      return null;
    }

    this.activeCampaignRuns.add(campaignId);
    try {
      const campaign = await prisma.broadcastCampaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status === 'CANCELLED') {
        return campaign;
      }

      const pendingRecipients = await prisma.broadcastRecipient.findMany({
        where: {
          campaign_id: campaignId,
          status: { in: ['SCHEDULED', 'QUEUED'] },
        },
        orderBy: { id: 'asc' },
      });

      const startedAt = campaign.started_at ?? new Date();
      await prisma.broadcastCampaign.update({
        where: { id: campaignId },
        data: {
          status: 'SENDING',
          started_at: startedAt,
        },
      });

      let sentCount = campaign.sent_count ?? 0;
      let failedCount = campaign.failed_count ?? 0;
      let skippedCount = campaign.skipped_count ?? 0;
      const totalRecipients =
        campaign.total_recipients ||
        pendingRecipients.length + sentCount + failedCount + skippedCount;

      getIo()?.emit('broadcast:progress', {
        campaignId,
        status: 'SENDING',
        sentCount,
        failedCount,
        skippedCount,
        totalRecipients,
      });

      const lastSendByAccount = new Map<string, number>();

      for (const recipient of pendingRecipients) {
        // Check if campaign was cancelled mid-flight
        const latestCampaign = await prisma.broadcastCampaign.findUnique({
          where: { id: campaignId },
          select: { status: true },
        });
        if (latestCampaign?.status === 'CANCELLED') {
          log.info('Campaign cancelled mid-execution — aborting remaining recipients', {
            campaignId,
          });
          break;
        }

        const accountKey = `${recipient.platform}:${recipient.zalo_account_id ?? recipient.line_account_id ?? 0}`;
        if (lastSendByAccount.has(accountKey) && process.env.NODE_ENV !== 'test') {
          const jitterMs = 600 + Math.floor(Math.random() * 600);
          await sleep(jitterMs);
        }

        if (recipient.platform === 'ZALO') {
          const zaloAccountId = recipient.zalo_account_id;
          const externalTargetId = recipient.external_target_id;

          if (!zaloAccountId || !externalTargetId) {
            await prisma.broadcastRecipient.update({
              where: { id: recipient.id },
              data: {
                status: !zaloAccountId ? 'SKIPPED_ACCOUNT_INACTIVE' : 'SKIPPED_NOT_FRIEND',
                error_message: !zaloAccountId
                  ? 'Thiếu tài khoản Zalo gửi tin'
                  : 'Không tìm thấy UID hoặc Group ID Zalo đích',
              },
            });
            skippedCount++;
          } else {
            const limitCheck = await zaloRateLimiter.checkLimits(zaloAccountId, 'message');
            if (!limitCheck.allowed) {
              await prisma.broadcastRecipient.update({
                where: { id: recipient.id },
                data: {
                  status: 'FAILED',
                  error_message: limitCheck.reason ?? 'Đã đạt giới hạn gửi tin nhắn Zalo',
                },
              });
              failedCount++;
            } else {
              let api = zaloPool.getApi(zaloAccountId);
              if (!api) {
                const reconnected = await zaloPool.tryReconnect(zaloAccountId);
                if (reconnected) {
                  api = zaloPool.getApi(zaloAccountId);
                }
              }

              if (!api) {
                await prisma.broadcastRecipient.update({
                  where: { id: recipient.id },
                  data: {
                    status: 'SKIPPED_ACCOUNT_INACTIVE',
                    error_message: 'Tài khoản Zalo chưa kết nối trong hệ thống',
                  },
                });
                skippedCount++;
              } else {
                const threadType: 0 | 1 =
                  recipient.target_type === 'ZALO_GROUP' || recipient.zalo_group_id != null
                    ? 1
                    : 0;
                const recipientMetadata = ((recipient as any).rendered_metadata ??
                  (campaign as any).message_metadata ??
                  null) as RichMessageMetadata | null;
                const { messagePayload, linksToSend } = buildZaloSendPayload(
                  recipient.rendered_content,
                  recipientMetadata,
                );
                try {
                  const sent = await api.sendMessage(
                    messagePayload,
                    externalTargetId,
                    threadType,
                  );
                  await zaloRateLimiter.recordSend(zaloAccountId, 'message');

                  if (linksToSend.length > 0) {
                    for (const linkItem of linksToSend) {
                      if (typeof api.sendLink === 'function') {
                        await api.sendLink(
                          {
                            link: linkItem.link,
                            ...(linkItem.msg ? { msg: linkItem.msg } : {}),
                          },
                          externalTargetId,
                          threadType,
                        );
                      } else {
                        await api.sendMessage(
                          linkItem.msg ? `${linkItem.msg}\n${linkItem.link}` : linkItem.link,
                          externalTargetId,
                          threadType,
                        );
                      }
                    }
                  }

                  lastSendByAccount.set(accountKey, Date.now());

                  const providerMessageId =
                    sent?.data?.messageId ??
                    sent?.message?.msgId ??
                    sent?.msgId ??
                    sent?.messageId ??
                    null;

                  await prisma.broadcastRecipient.update({
                    where: { id: recipient.id },
                    data: {
                      status: 'SENT',
                      sent_at: new Date(),
                      provider_message_id:
                        providerMessageId != null ? String(providerMessageId) : null,
                      error_message: null,
                    },
                  });
                  sentCount++;
                } catch (sendErr: any) {
                  await prisma.broadcastRecipient.update({
                    where: { id: recipient.id },
                    data: {
                      status: 'FAILED',
                      error_message: sendErr?.message ?? String(sendErr),
                    },
                  });
                  failedCount++;
                }
              }
            }
          }
        } else if (recipient.platform === 'LINE') {
          const lineAccountId = recipient.line_account_id;
          const externalTargetId = recipient.external_target_id;
          const dispatcher = getLineDeliveryDispatcher();

          if (!dispatcher || !lineAccountId) {
            await prisma.broadcastRecipient.update({
              where: { id: recipient.id },
              data: {
                status: 'SKIPPED_ACCOUNT_INACTIVE',
                error_message: !dispatcher
                  ? 'LINE delivery dispatcher chưa sẵn sàng'
                  : 'Thiếu tài khoản LINE gửi tin',
              },
            });
            skippedCount++;
          } else if (!externalTargetId) {
            await prisma.broadcastRecipient.update({
              where: { id: recipient.id },
              data: {
                status: 'SKIPPED_NOT_FRIEND',
                error_message: 'Không tìm thấy LINE UID hoặc Group ID đích',
              },
            });
            skippedCount++;
          } else {
            const ready = await dispatcher.ensureAccountReady(lineAccountId);
            if (!ready) {
              await prisma.broadcastRecipient.update({
                where: { id: recipient.id },
                data: {
                  status: 'SKIPPED_ACCOUNT_INACTIVE',
                  error_message: 'Tài khoản LINE chưa kết nối hoặc không hoạt động',
                },
              });
              skippedCount++;
            } else {
              const isGroup =
                recipient.target_type === 'LINE_GROUP' ||
                recipient.line_group_id != null ||
                externalTargetId.startsWith('C') ||
                externalTargetId.startsWith('c');

              const recipientMetadata = ((recipient as any).rendered_metadata ??
                (campaign as any).message_metadata ??
                null) as RichMessageMetadata | null;
              const retryKey = buildLineBroadcastRetryKey(recipient.id);
              try {
                const sent = isGroup
                  ? await dispatcher.sendGroupMessage({
                      lineAccountId,
                      targetLineGroupId: externalTargetId,
                      content: recipient.rendered_content,
                      ...(recipientMetadata ? { richMetadata: recipientMetadata } : {}),
                      retryKey,
                      sentVia: 'automation',
                    })
                  : await dispatcher.sendPersonalMessage({
                      lineAccountId,
                      targetLineUid: externalTargetId,
                      content: recipient.rendered_content,
                      ...(recipientMetadata ? { richMetadata: recipientMetadata } : {}),
                      retryKey,
                      sentVia: 'automation',
                    });

                lastSendByAccount.set(accountKey, Date.now());

                await prisma.broadcastRecipient.update({
                  where: { id: recipient.id },
                  data: {
                    status: 'SENT',
                    sent_at: new Date(),
                    provider_message_id: sent?.providerMessageId ?? null,
                    error_message: null,
                  },
                });
                sentCount++;
              } catch (sendErr: any) {
                await prisma.broadcastRecipient.update({
                  where: { id: recipient.id },
                  data: {
                    status: 'FAILED',
                    error_message: sendErr?.message ?? String(sendErr),
                  },
                });
                failedCount++;
              }
            }
          }
        }

        await prisma.broadcastCampaign.update({
          where: { id: campaignId },
          data: {
            sent_count: sentCount,
            failed_count: failedCount,
            skipped_count: skippedCount,
          },
        });

        getIo()?.emit('broadcast:progress', {
          campaignId,
          status: 'SENDING',
          sentCount,
          failedCount,
          skippedCount,
          totalRecipients,
        });
      }

      // Compute final campaign status
      let finalStatus: BroadcastCampaignStatus = 'COMPLETED';
      if (failedCount > 0 && sentCount > 0) {
        finalStatus = 'PARTIAL_FAILED';
      } else if (failedCount > 0 && sentCount === 0) {
        finalStatus = 'FAILED';
      }

      const completedCampaign = await prisma.broadcastCampaign.update({
        where: { id: campaignId },
        data: {
          status: finalStatus,
          sent_count: sentCount,
          failed_count: failedCount,
          skipped_count: skippedCount,
          completed_at: new Date(),
        },
        include: {
          recipients: {
            orderBy: { id: 'asc' },
          },
        },
      });

      getIo()?.emit('broadcast:completed', {
        campaignId,
        status: finalStatus,
        sentCount,
        failedCount,
        skippedCount,
        totalRecipients,
      });

      log.info('Broadcast campaign finished', {
        campaignId,
        status: finalStatus,
        sentCount,
        failedCount,
        skippedCount,
        totalRecipients,
      });

      return completedCampaign;
    } finally {
      this.activeCampaignRuns.delete(campaignId);
    }
  }

  /**
   * Poll and execute all SCHEDULED campaigns whose `scheduled_at <= now`.
   */
  async processDueScheduledCampaigns(): Promise<{
    processedCount: number;
    campaignIds: number[];
  }> {
    if (this.isPollingScheduled) {
      return { processedCount: 0, campaignIds: [] };
    }

    this.isPollingScheduled = true;
    try {
      const now = new Date();
      const dueCampaigns = await prisma.broadcastCampaign.findMany({
        where: {
          status: 'SCHEDULED',
          scheduled_at: { lte: now },
        },
        orderBy: { scheduled_at: 'asc' },
      });

      const executedIds: number[] = [];
      for (const campaign of dueCampaigns) {
        log.info('Executing due scheduled broadcast campaign', {
          campaignId: campaign.id,
          name: campaign.name,
          scheduledAt: campaign.scheduled_at,
        });
        await this.executeCampaign(campaign.id);
        executedIds.push(campaign.id);
      }

      return {
        processedCount: executedIds.length,
        campaignIds: executedIds,
      };
    } finally {
      this.isPollingScheduled = false;
    }
  }

  /**
   * List broadcast campaigns with optional filters and pagination.
   */
  async listCampaigns(
    userId?: number,
    role: string = 'ADMIN',
    query: ListBroadcastCampaignsQuery = {},
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId && !['ADMIN', 'MANAGE'].includes(role)) {
      where.created_by_id = userId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search?.trim()) {
      where.OR = [
        { name: { contains: query.search.trim() } },
        { description: { contains: query.search.trim() } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.broadcastCampaign.findMany({
        where,
        include: {
          _count: { select: { recipients: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.broadcastCampaign.count({ where }),
    ]);

    return {
      items,
      campaigns: items,
      total,
      page,
      limit,
    };
  }

  /**
   * Get campaign detail including all recipients.
   */
  async getCampaignDetail(campaignId: number) {
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
      include: {
        recipients: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!campaign) {
      throw Object.assign(new Error('Không tìm thấy chiến dịch gửi tin'), { status: 404 });
    }

    return campaign;
  }

  /**
   * Return the full catalog of selectable broadcast targets:
   * `{ students, zaloGroups, lineGroups, zaloAccounts, lineAccounts }`
   */
  async getTargetsCatalog(userId?: number, role: string = 'ADMIN') {
    const isAdmin = ['ADMIN', 'MANAGE'].includes(role);
    const csFilter = !isAdmin && userId ? { cs_id: userId } : {};

    const [students, zaloGroups, lineGroups, zaloAccounts, lineAccounts] = await Promise.all([
      prisma.student.findMany({
        where: !isAdmin && userId ? { enrollments: { some: { cs_id: userId } } } : {},
        include: {
          enrollments: {
            orderBy: { updated_at: 'desc' },
            take: 1,
            include: {
              package: { select: { id: true, code: true, name: true } },
              cs: { select: { id: true, name: true } },
              enrollment_classes: {
                take: 1,
                include: {
                  class: { select: { id: true, class_name: true } },
                },
              },
            },
          },
          zalo_contact_relations: {
            include: {
              zalo_account: { select: { id: true, display_name: true, status: true } },
              zalo_group: { select: { id: true, zalo_group_id: true, name: true } },
            },
          },
          line_contact_relations: {
            include: {
              line_account: {
                select: { id: true, display_name: true, status: true, account_type: true },
              },
              line_group: { select: { id: true, line_group_id: true, name: true } },
            },
          },
        },
        orderBy: { updated_at: 'desc' },
        take: 500,
      }),
      prisma.zaloGroup.findMany({
        where: {
          zalo_account: {
            archived_at: null,
            ...csFilter,
          },
        },
        include: {
          zalo_account: {
            select: { id: true, cs_id: true, display_name: true, status: true },
          },
        },
        orderBy: { updated_at: 'desc' },
      }),
      prisma.lineGroup.findMany({
        where: {
          line_account: {
            archived_at: null,
            ...csFilter,
          },
        },
        include: {
          line_account: {
            select: {
              id: true,
              cs_id: true,
              display_name: true,
              status: true,
              account_type: true,
            },
          },
        },
        orderBy: { updated_at: 'desc' },
      }),
      prisma.zaloAccount.findMany({
        where: {
          archived_at: null,
          ...csFilter,
        },
        select: {
          id: true,
          cs_id: true,
          zalo_uid: true,
          display_name: true,
          status: true,
          avatar_url: true,
        },
        orderBy: { updated_at: 'desc' },
      }),
      prisma.lineAccount.findMany({
        where: {
          archived_at: null,
          ...csFilter,
        },
        select: {
          id: true,
          cs_id: true,
          account_type: true,
          line_mid: true,
          basic_id: true,
          display_name: true,
          status: true,
          avatar_url: true,
        },
        orderBy: { updated_at: 'desc' },
      }),
    ]);

    return {
      students,
      zaloGroups,
      lineGroups,
      zaloAccounts,
      lineAccounts,
    };
  }

  /**
   * Cancel a scheduled or sending campaign.
   */
  async cancelCampaign(campaignId: number) {
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw Object.assign(new Error('Không tìm thấy chiến dịch gửi tin'), { status: 404 });
    }
    if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
      throw Object.assign(
        new Error('Chiến dịch đã hoàn tất hoặc đã hủy trước đó'),
        { status: 400 },
      );
    }

    await prisma.broadcastRecipient.updateMany({
      where: {
        campaign_id: campaignId,
        status: { in: ['SCHEDULED', 'QUEUED'] },
      },
      data: {
        status: 'CANCELLED',
      },
    });

    const updated = await prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'CANCELLED',
      },
      include: {
        recipients: { orderBy: { id: 'asc' } },
      },
    });

    return updated;
  }

  /**
   * Trigger immediate execution of a SCHEDULED or DRAFT campaign.
   */
  async sendNowCampaign(campaignId: number, options?: { awaitExecution?: boolean }) {
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw Object.assign(new Error('Không tìm thấy chiến dịch gửi tin'), { status: 404 });
    }
    if (campaign.status === 'COMPLETED') {
      throw Object.assign(new Error('Chiến dịch đã hoàn tất gửi'), { status: 400 });
    }

    if (campaign.status === 'CANCELLED') {
      await prisma.broadcastRecipient.updateMany({
        where: {
          campaign_id: campaignId,
          status: 'CANCELLED',
        },
        data: {
          status: 'SCHEDULED',
        },
      });
    }

    await prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENDING',
        started_at: new Date(),
      },
    });

    if (options?.awaitExecution || process.env.NODE_ENV === 'test') {
      return await this.executeCampaign(campaignId);
    }

    this.executeCampaign(campaignId).catch((err) => {
      log.error('sendNowCampaign background execution failed', {
        campaignId,
        error: err?.message ?? String(err),
      });
    });

    return this.getCampaignDetail(campaignId);
  }

  /**
   * Retry failed or skipped-inactive recipients in a campaign.
   */
  async retryFailedRecipients(campaignId: number, options?: { awaitExecution?: boolean }) {
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw Object.assign(new Error('Không tìm thấy chiến dịch gửi tin'), { status: 404 });
    }

    const resetResult = await prisma.broadcastRecipient.updateMany({
      where: {
        campaign_id: campaignId,
        status: {
          in: ['FAILED', 'SKIPPED_ACCOUNT_INACTIVE', 'SKIPPED_SESSION_EXPIRED'],
        },
      },
      data: {
        status: 'SCHEDULED',
        error_message: null,
      },
    });

    if (resetResult.count === 0) {
      return this.getCampaignDetail(campaignId);
    }

    // Recalculate current non-pending counts before re-running
    const remainingRecipients = await prisma.broadcastRecipient.findMany({
      where: { campaign_id: campaignId },
      select: { status: true },
    });

    const sentCount = remainingRecipients.filter((r) => r.status === 'SENT').length;
    const failedCount = remainingRecipients.filter((r) => r.status === 'FAILED').length;
    const skippedCount = remainingRecipients.filter((r) =>
      r.status.startsWith('SKIPPED_'),
    ).length;

    await prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENDING',
        sent_count: sentCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        completed_at: null,
      },
    });

    if (options?.awaitExecution || process.env.NODE_ENV === 'test') {
      return await this.executeCampaign(campaignId);
    }

    this.executeCampaign(campaignId).catch((err) => {
      log.error('retryFailedRecipients background execution failed', {
        campaignId,
        error: err?.message ?? String(err),
      });
    });

    return this.getCampaignDetail(campaignId);
  }

  /**
   * Delete a campaign and its recipients.
   */
  async deleteCampaign(campaignId: number) {
    const campaign = await prisma.broadcastCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      throw Object.assign(new Error('Không tìm thấy chiến dịch gửi tin'), { status: 404 });
    }

    await prisma.broadcastCampaign.delete({
      where: { id: campaignId },
    });

    return { deleted: true, id: campaignId };
  }
}

export const broadcastService = new BroadcastService();
