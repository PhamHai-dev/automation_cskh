import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '../../../api/client';
import { zaloApi } from '../../zalo/api/zalo.api';
import { lineApi } from '../../line/api/line.api';
import type { ZaloAccount } from '../../zalo/types/zalo.types';
import type { LineAccount, LineFriend, LineGroupInfo } from '../../line/types/line.types';
import {
  omnichannelApi,
  type CareGroupSyncReport,
  type LinkedStudentCareGroupItem,
  type UnlinkedStudentCareGroupItem,
} from '../api/omnichannel.api';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useSocket } from '../../../hooks/useSocket';
import { useToast } from '../../../components/ui/Toast';
import {
  Link2,
  Sparkles,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Copy,
  Check,
  Info,
  UserCheck,
  Users,
  Unlink2,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
  Clock,
} from 'lucide-react';

type FilterTab = 'ALL' | 'UNLINKED' | 'LINKED' | 'UNLINKED_ZALO' | 'UNLINKED_LINE';

interface ChannelRelationBadge {
  relationId?: number | null;
  accountId: number;
  accountName: string;
  targetType: 'GROUP' | 'USER';
  groupId?: number | null;
  externalTargetId?: string | null;
  displayName: string;
  newlyLinked?: boolean;
}

interface StudentCoverageRow {
  id: number;
  external_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  cs_id: number | null;
  cs_name: string | null;
  cs_code: string | null;
  cs_display: string;
  suggested_group_name: string | null;
  zaloLinked: boolean;
  zaloRelation: ChannelRelationBadge | null;
  lineLinked: boolean;
  lineRelation: ChannelRelationBadge | null;
  newlyLinked: boolean;
}

function extractCsNumberFromCode(csCode?: string | null): string | null {
  if (!csCode) return null;
  const match = csCode.toUpperCase().match(/CVHT[-_\s]*(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (Number.isFinite(num) && num > 0) {
      return String(num).padStart(2, '0');
    }
  }
  const digits = csCode.match(/(\d+)/);
  if (digits) {
    const num = parseInt(digits[1], 10);
    if (Number.isFinite(num) && num > 0) {
      return String(num).padStart(2, '0');
    }
  }
  return null;
}

function buildSuggestedGroupName(
  csCode?: string | null,
  externalId?: string | null,
  fullName?: string | null,
): string | null {
  const ext = (externalId || '').trim();
  if (!ext) return null;
  const csNum = extractCsNumberFromCode(csCode) || '01';
  const name = (fullName || '').trim();
  return name ? `${csNum} - ${ext} ${name}` : `${csNum} - ${ext}`;
}

export const OmnichannelStudentLinksPage: React.FC<{ initialTab?: string }> = ({
  initialTab,
}) => {
  const toast = useToast();
  const { on, off } = useSocket();

  // Accounts & Data
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([]);
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [students, setStudents] = useState<StudentCoverageRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters & UI state
  const [filterTab, setFilterTab] = useState<FilterTab>(() => {
    if (initialTab === 'ZALO' || initialTab === 'UNLINKED_ZALO') return 'UNLINKED_ZALO';
    if (initialTab === 'LINE' || initialTab === 'UNLINKED_LINE') return 'UNLINKED_LINE';
    if (initialTab === 'UNLINKED') return 'UNLINKED';
    if (initialTab === 'LINKED') return 'LINKED';
    return 'ALL';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCsFilter, setSelectedCsFilter] = useState<string>('ALL');
  const [showGuide, setShowGuide] = useState(true);

  // Sync & Report state
  const [careReport, setCareReport] = useState<CareGroupSyncReport | null>(null);
  const [syncingCareGroups, setSyncingCareGroups] = useState(false);
  const [liveSyncStage, setLiveSyncStage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [unlinkingKey, setUnlinkingKey] = useState<string | null>(null);

  // Inline Link Modal state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkModalStudent, setLinkModalStudent] = useState<StudentCoverageRow | null>(null);
  const [linkModalPlatform, setLinkModalPlatform] = useState<'ZALO' | 'LINE'>('ZALO');
  const [linkModalTargetType, setLinkModalTargetType] = useState<'GROUP' | 'USER'>('GROUP');
  const [linkModalAccountId, setLinkModalAccountId] = useState<number>(0);
  const [linkModalSearch, setLinkModalSearch] = useState('');
  const [linkModalLoadingItems, setLinkModalLoadingItems] = useState(false);
  const [linkModalSaving, setLinkModalSaving] = useState(false);
  const [zaloGroupsList, setZaloGroupsList] = useState<any[]>([]);
  const [zaloFriendsList, setZaloFriendsList] = useState<any[]>([]);
  const [lineGroupsList, setLineGroupsList] = useState<LineGroupInfo[]>([]);
  const [lineFriendsList, setLineFriendsList] = useState<LineFriend[]>([]);
  const [selectedGroupItem, setSelectedGroupItem] = useState<any | null>(null);
  const [selectedFriendItem, setSelectedFriendItem] = useState<any | null>(null);

  // 2-Tap QR Code Modal state
  const [deepLinkModal, setDeepLinkModal] = useState<{
    studentName: string;
    linkCode: string;
    deepLinkUrl: string;
  } | null>(null);

  const loadWorkspaceData = useCallback(async (opts?: { silent?: boolean; skipReport?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const [studentsRes, reportRes, zAccs, lAccs] = await Promise.all([
        apiClient.get('/students').catch(() => ({ data: { data: [] } })),
        opts?.skipReport ? Promise.resolve(null) : omnichannelApi.getCareGroupReport().catch(() => null),
        zaloApi.listAccounts().catch(() => [] as ZaloAccount[]),
        lineApi.listAccounts().catch(() => [] as LineAccount[]),
      ]);

      const safeZaloAccs = Array.isArray(zAccs) ? zAccs : [];
      const safeLineAccs = Array.isArray(lAccs) ? lAccs : [];
      setZaloAccounts(safeZaloAccs);
      setLineAccounts(safeLineAccs);

      if (reportRes) {
        setCareReport(reportRes);
      }

      // Fetch actual linked relations per account so we have relation.id for 1-click unlink/edit
      // and authoritative friend/group links
      const [zaloAccRelationsLists, lineAccRelationsLists] = await Promise.all([
        Promise.all(
          safeZaloAccs.map((acc) =>
            zaloApi.listAccountStudentLinks(acc.id).catch(() => [] as any[]),
          ),
        ),
        Promise.all(
          safeLineAccs.map((acc) =>
            lineApi
              .listLinksByAccount(acc.id)
              .then((r) => r.items ?? [])
              .catch(() => [] as any[]),
          ),
        ),
      ]);

      const zaloRelByStudent = new Map<number, any>();
      for (const list of zaloAccRelationsLists) {
        for (const rel of list) {
          const stId = Number(rel.student_id ?? rel.student?.id);
          if (stId && (!zaloRelByStudent.has(stId) || rel.target_type === 'GROUP' || rel.zalo_group)) {
            zaloRelByStudent.set(stId, rel);
          }
        }
      }

      const lineRelByStudent = new Map<number, any>();
      for (const list of lineAccRelationsLists) {
        for (const rel of list) {
          const stId = Number(rel.student_id ?? rel.student?.id);
          if (stId && (!lineRelByStudent.has(stId) || rel.target_type === 'GROUP' || rel.line_group)) {
            lineRelByStudent.set(stId, rel);
          }
        }
      }

      const zaloAccNameMap = new Map<number, string>(
        safeZaloAccs.map((a) => [a.id, a.display_name || `Zalo #${a.id}`]),
      );
      const lineAccNameMap = new Map<number, string>(
        safeLineAccs.map((a) => [a.id, a.display_name || `LINE #${a.id}`]),
      );

      const linkedMap = new Map<number, LinkedStudentCareGroupItem>();
      const unlinkedMap = new Map<number, UnlinkedStudentCareGroupItem>();
      if (reportRes) {
        for (const item of reportRes.linkedItems ?? []) {
          linkedMap.set(Number(item.studentId), item);
        }
        for (const item of reportRes.unlinkedItems ?? []) {
          unlinkedMap.set(Number(item.studentId), item);
        }
      }

      const rawStudents: any[] =
        studentsRes.data?.data ?? studentsRes.data?.students ?? studentsRes.data ?? [];

      const rows: StudentCoverageRow[] = (Array.isArray(rawStudents) ? rawStudents : []).map(
        (s: any) => {
          const studentId = Number(s.id);
          const linkedReportItem = linkedMap.get(studentId);
          const unlinkedReportItem = unlinkedMap.get(studentId);

          const firstEnr = Array.isArray(s.enrollments) ? s.enrollments[0] : null;
          const csObj = firstEnr?.cs;
          const csId =
            linkedReportItem?.csId ??
            unlinkedReportItem?.csId ??
            csObj?.id ??
            firstEnr?.cs_id ??
            null;
          const csName =
            linkedReportItem?.csName ??
            unlinkedReportItem?.csName ??
            csObj?.name ??
            firstEnr?.sale_name ??
            null;
          const csCode =
            linkedReportItem?.csCode ??
            unlinkedReportItem?.csCode ??
            csObj?.code ??
            null;

          let csDisplay = 'Chưa phân công CSKH';
          if (csName && csCode) {
            csDisplay = csName.toUpperCase().includes(csCode.toUpperCase())
              ? csName
              : `${csName} - ${csCode}`;
          } else if (csName || csCode || csObj?.email) {
            csDisplay = csName || csCode || csObj?.email;
          }

          const externalId =
            s.external_id ||
            linkedReportItem?.studentExternalId ||
            unlinkedReportItem?.studentExternalId ||
            firstEnr?.external_id ||
            null;

          const suggestedGroupName =
            unlinkedReportItem?.suggestedGroupName ||
            buildSuggestedGroupName(csCode, externalId, s.full_name) ||
            linkedReportItem?.zaloGroupName ||
            linkedReportItem?.lineGroupName ||
            null;

          // Authoritative Zalo relation resolution:
          // Check s.zalo_contact_relations (if included on student), account relation map, and careReport.linkedItems where zaloGroupName is non-empty
          const inlineZaloRel = Array.isArray(s.zalo_contact_relations)
            ? s.zalo_contact_relations.find((r: any) => r.relation_status === 'FRIEND') ??
              s.zalo_contact_relations[0]
            : null;
          const accZaloRel = zaloRelByStudent.get(studentId) ?? inlineZaloRel;
          const reportHasZaloGroup = Boolean(
            linkedReportItem?.zaloLinked && linkedReportItem?.zaloGroupName?.trim(),
          );

          let zaloRelation: ChannelRelationBadge | null = null;
          if (accZaloRel) {
            const groupName = accZaloRel.zalo_group?.name || linkedReportItem?.zaloGroupName;
            const friendName =
              accZaloRel.friendDisplayName ||
              accZaloRel.display_name ||
              groupName ||
              'Đã gắn Zalo';
            const accId = Number(
              accZaloRel.zalo_account_id ?? linkedReportItem?.zaloAccountId ?? 0,
            );
            zaloRelation = {
              relationId: accZaloRel.id ?? null,
              accountId: accId,
              accountName:
                accZaloRel.zalo_account?.display_name ||
                zaloAccNameMap.get(accId) ||
                `Tài khoản Zalo #${accId}`,
              targetType:
                accZaloRel.target_type === 'GROUP' || Boolean(accZaloRel.zalo_group || groupName)
                  ? 'GROUP'
                  : 'USER',
              groupId: accZaloRel.zalo_group_id ?? accZaloRel.zalo_group?.id ?? null,
              externalTargetId:
                accZaloRel.zalo_group?.zalo_group_id ||
                accZaloRel.friend_zalo_uid ||
                accZaloRel.friendZaloUid ||
                null,
              displayName: groupName || friendName,
              newlyLinked: Boolean(linkedReportItem?.newlyLinked),
            };
          } else if (reportHasZaloGroup && linkedReportItem) {
            const accId = Number(linkedReportItem.zaloAccountId ?? 0);
            zaloRelation = {
              relationId: null,
              accountId: accId,
              accountName: zaloAccNameMap.get(accId) || (accId ? `Zalo #${accId}` : 'Zalo'),
              targetType: 'GROUP',
              externalTargetId: linkedReportItem.zaloGroupId ?? null,
              displayName: linkedReportItem.zaloGroupName!,
              newlyLinked: Boolean(linkedReportItem.newlyLinked),
            };
          }

          // Authoritative LINE relation resolution:
          const inlineLineRel = Array.isArray(s.line_contact_relations)
            ? s.line_contact_relations.find((r: any) => r.relation_status === 'FRIEND') ??
              s.line_contact_relations[0]
            : null;
          const accLineRel = lineRelByStudent.get(studentId) ?? inlineLineRel;
          const reportHasLineGroup = Boolean(
            linkedReportItem?.lineLinked && linkedReportItem?.lineGroupName?.trim(),
          );

          let lineRelation: ChannelRelationBadge | null = null;
          if (accLineRel) {
            const groupName = accLineRel.line_group?.name || linkedReportItem?.lineGroupName;
            const friendName =
              accLineRel.display_name || groupName || 'Đã gắn LINE';
            const accId = Number(
              accLineRel.line_account_id ?? linkedReportItem?.lineAccountId ?? 0,
            );
            lineRelation = {
              relationId: accLineRel.id ?? null,
              accountId: accId,
              accountName:
                accLineRel.line_account?.display_name ||
                lineAccNameMap.get(accId) ||
                `Tài khoản LINE #${accId}`,
              targetType:
                accLineRel.target_type === 'GROUP' || Boolean(accLineRel.line_group || groupName)
                  ? 'GROUP'
                  : 'USER',
              groupId: accLineRel.line_group_id ?? accLineRel.line_group?.id ?? null,
              externalTargetId:
                accLineRel.line_group?.line_group_id || accLineRel.friend_line_uid || null,
              displayName: groupName || friendName,
              newlyLinked: Boolean(linkedReportItem?.newlyLinked),
            };
          } else if (reportHasLineGroup && linkedReportItem) {
            const accId = Number(linkedReportItem.lineAccountId ?? 0);
            lineRelation = {
              relationId: null,
              accountId: accId,
              accountName: lineAccNameMap.get(accId) || (accId ? `LINE #${accId}` : 'LINE'),
              targetType: 'GROUP',
              externalTargetId: linkedReportItem.lineGroupId ?? null,
              displayName: linkedReportItem.lineGroupName!,
              newlyLinked: Boolean(linkedReportItem.newlyLinked),
            };
          }

          return {
            id: studentId,
            external_id: externalId,
            full_name: s.full_name,
            phone: s.phone || null,
            email: s.email || null,
            cs_id: csId ? Number(csId) : null,
            cs_name: csName,
            cs_code: csCode,
            cs_display: csDisplay,
            suggested_group_name: suggestedGroupName,
            zaloLinked: Boolean(zaloRelation),
            zaloRelation,
            lineLinked: Boolean(lineRelation),
            lineRelation,
            newlyLinked: Boolean(linkedReportItem?.newlyLinked),
          };
        },
      );

      setStudents(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const handleSyncAndMatchCareGroups = useCallback(async () => {
    setSyncingCareGroups(true);
    setLiveSyncStage(
      'Đang tải danh sách nhóm mới nhất từ các tài khoản Zalo và LINE đang kết nối...',
    );
    try {
      const report = await omnichannelApi.syncAndMatchCareGroups({
        refreshLiveGroups: true,
      });
      setCareReport(report);
      toast.success(
        `Đồng bộ hoàn tất: Đã gắn nhóm cho ${report.linkedStudentsCount}/${report.totalEligibleStudents} học viên (Mới gắn: +${report.newlyLinkedZaloCount} Zalo, +${report.newlyLinkedLineCount} LINE)`,
      );
      await loadWorkspaceData();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          'Không thể đồng bộ Nhóm Chăm sóc Zalo/LINE',
      );
    } finally {
      setSyncingCareGroups(false);
      setLiveSyncStage(null);
    }
  }, [loadWorkspaceData, toast]);

  // Listen to Socket.IO live sync events
  useEffect(() => {
    const onSyncProgress = (payload: any) => {
      setSyncingCareGroups(true);
      if (payload?.message || payload?.stage) {
        setLiveSyncStage(String(payload.message || payload.stage));
      }
    };

    const onSyncComplete = (payload: any) => {
      setSyncingCareGroups(false);
      setLiveSyncStage(null);
      const reportPayload = payload?.report ?? payload;
      if (reportPayload && typeof reportPayload.totalEligibleStudents === 'number') {
        setCareReport(reportPayload as CareGroupSyncReport);
      }
      loadWorkspaceData({ silent: true, skipReport: true });
    };

    on('omnichannel:sync-progress', onSyncProgress);
    on('omnichannel:sync-complete', onSyncComplete);
    on('import:sync-progress', onSyncProgress);

    return () => {
      off('omnichannel:sync-progress', onSyncProgress);
      off('omnichannel:sync-complete', onSyncComplete);
      off('import:sync-progress', onSyncProgress);
    };
  }, [on, off, loadWorkspaceData]);

  // Open Inline Link Modal for a specific student and channel
  const openInlineLinkModal = (
    student: StudentCoverageRow,
    platform: 'ZALO' | 'LINE',
    defaultTargetType: 'GROUP' | 'USER' = 'GROUP',
  ) => {
    setLinkModalStudent(student);
    setLinkModalPlatform(platform);
    setLinkModalTargetType(defaultTargetType);
    setLinkModalSearch('');
    setSelectedGroupItem(null);
    setSelectedFriendItem(null);

    if (platform === 'ZALO') {
      const existingAccId = student.zaloRelation?.accountId;
      const defaultAcc =
        (existingAccId && zaloAccounts.find((a) => a.id === existingAccId)) ||
        zaloAccounts.find((a) => (a.liveStatus || a.status) === 'ACTIVE') ||
        zaloAccounts[0];
      setLinkModalAccountId(defaultAcc?.id || 0);
    } else {
      const existingAccId = student.lineRelation?.accountId;
      const defaultAcc =
        (existingAccId && lineAccounts.find((a) => a.id === existingAccId)) ||
        lineAccounts.find((a) => (a.liveStatus || a.status) === 'ACTIVE') ||
        lineAccounts[0];
      setLinkModalAccountId(defaultAcc?.id || 0);
    }

    setLinkModalOpen(true);
  };

  // Load groups & friends when Inline Link Modal opens or account changes
  useEffect(() => {
    if (!linkModalOpen || !linkModalAccountId) return;
    let cancelled = false;
    setLinkModalLoadingItems(true);
    setSelectedGroupItem(null);
    setSelectedFriendItem(null);

    if (linkModalPlatform === 'ZALO') {
      Promise.all([
        zaloApi.getGroupsDb(linkModalAccountId).catch(() => []),
        zaloApi
          .getFriendsDb(linkModalAccountId, { limit: 200 })
          .then((r) => r?.data?.friends ?? r?.friends ?? [])
          .catch(() => []),
      ])
        .then(([groups, friends]) => {
          if (cancelled) return;
          setZaloGroupsList(Array.isArray(groups) ? groups : []);
          setZaloFriendsList(Array.isArray(friends) ? friends : []);
        })
        .finally(() => {
          if (!cancelled) setLinkModalLoadingItems(false);
        });
    } else {
      Promise.all([
        lineApi.listAccountGroups(linkModalAccountId).catch(() => []),
        lineApi
          .listFriends(linkModalAccountId, { limit: 200 })
          .then((r) => r.items ?? [])
          .catch(() => []),
      ])
        .then(([groups, friends]) => {
          if (cancelled) return;
          setLineGroupsList(Array.isArray(groups) ? groups : []);
          setLineFriendsList(Array.isArray(friends) ? friends : []);
        })
        .finally(() => {
          if (!cancelled) setLinkModalLoadingItems(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [linkModalOpen, linkModalPlatform, linkModalAccountId]);

  const handleSaveInlineLink = async () => {
    if (!linkModalStudent || !linkModalAccountId) return;
    setLinkModalSaving(true);
    try {
      if (linkModalPlatform === 'ZALO') {
        if (linkModalTargetType === 'GROUP') {
          if (!selectedGroupItem) {
            toast.warning('Vui lòng chọn một Nhóm Zalo trong danh sách');
            setLinkModalSaving(false);
            return;
          }
          const groupName =
            selectedGroupItem.name || `Nhóm Zalo #${selectedGroupItem.zalo_group_id}`;
          await zaloApi.createStudentLink({
            student_id: linkModalStudent.id,
            zalo_account_id: linkModalAccountId,
            zalo_group_id: selectedGroupItem.id,
            target_type: 'GROUP',
            friend_zalo_uid: selectedGroupItem.zalo_group_id,
            display_name: groupName,
            relation_status: 'FRIEND',
          });
          toast.success(
            `Đã gắn Nhóm Zalo "${groupName}" cho học viên ${linkModalStudent.full_name}`,
          );
        } else {
          if (!selectedFriendItem) {
            toast.warning('Vui lòng chọn một Bạn bè Zalo trong danh sách');
            setLinkModalSaving(false);
            return;
          }
          const friendName =
            selectedFriendItem.zalo_display_name ||
            selectedFriendItem.alias_in_nick ||
            selectedFriendItem.zalo_uid_in_nick ||
            'Bạn bè Zalo';
          await zaloApi.createStudentLink({
            student_id: linkModalStudent.id,
            zalo_account_id: linkModalAccountId,
            target_type: 'USER',
            friend_zalo_uid: selectedFriendItem.zalo_uid_in_nick || undefined,
            display_name: friendName,
            relation_status: 'FRIEND',
          });
          toast.success(
            `Đã gắn tài khoản Zalo "${friendName}" cho học viên ${linkModalStudent.full_name}`,
          );
        }
      } else {
        if (linkModalTargetType === 'GROUP') {
          if (!selectedGroupItem) {
            toast.warning('Vui lòng chọn một Nhóm LINE trong danh sách');
            setLinkModalSaving(false);
            return;
          }
          const groupName =
            selectedGroupItem.name || `Nhóm LINE #${selectedGroupItem.line_group_id}`;
          await lineApi.createLink({
            student_id: linkModalStudent.id,
            line_account_id: linkModalAccountId,
            line_group_id: selectedGroupItem.id,
            target_type: 'GROUP',
            friend_line_uid: selectedGroupItem.line_group_id,
            display_name: groupName,
            relation_status: 'FRIEND',
          });
          toast.success(
            `Đã gắn Nhóm LINE "${groupName}" cho học viên ${linkModalStudent.full_name}`,
          );
        } else {
          if (!selectedFriendItem) {
            toast.warning('Vui lòng chọn một Liên hệ LINE trong danh sách');
            setLinkModalSaving(false);
            return;
          }
          const friendName =
            selectedFriendItem.line_display_name ||
            selectedFriendItem.alias_in_nick ||
            selectedFriendItem.line_uid_in_nick ||
            'Bạn bè LINE';
          await lineApi.createLink({
            student_id: linkModalStudent.id,
            line_account_id: linkModalAccountId,
            target_type: 'USER',
            friend_line_uid: selectedFriendItem.line_uid_in_nick,
            display_name: friendName,
            relation_status: 'FRIEND',
          });
          toast.success(
            `Đã gắn liên hệ LINE "${friendName}" cho học viên ${linkModalStudent.full_name}`,
          );
        }
      }

      setLinkModalOpen(false);
      await loadWorkspaceData();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          'Không thể lưu liên kết cho học viên',
      );
    } finally {
      setLinkModalSaving(false);
    }
  };

  // Unlink Zalo or LINE directly from row
  const handleUnlinkChannel = async (
    student: StudentCoverageRow,
    platform: 'ZALO' | 'LINE',
  ) => {
    const rel = platform === 'ZALO' ? student.zaloRelation : student.lineRelation;
    if (!rel) return;

    const confirmMsg = `Bạn có chắc muốn gỡ liên kết ${platform} ("${rel.displayName}") khỏi học viên ${student.full_name}?`;
    if (!window.confirm(confirmMsg)) return;

    const key = `${platform}-${student.id}`;
    setUnlinkingKey(key);
    try {
      let relationId = rel.relationId;
      if (!relationId) {
        if (platform === 'ZALO') {
          const links = await zaloApi.listStudentLinks(student.id);
          relationId = links[0]?.id;
        } else {
          const res = await lineApi.listLinksByStudent(student.id);
          relationId = res.items?.[0]?.id;
        }
      }

      if (!relationId) {
        toast.error('Không tìm thấy mã liên kết để gỡ. Đang làm mới dữ liệu...');
        await loadWorkspaceData();
        return;
      }

      if (platform === 'ZALO') {
        await zaloApi.deleteStudentLink(relationId);
      } else {
        await lineApi.deleteLink(relationId);
      }

      toast.success(`Đã gỡ liên kết ${platform} của học viên ${student.full_name}`);
      await loadWorkspaceData();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || err?.message || `Không thể gỡ liên kết ${platform}`,
      );
    } finally {
      setUnlinkingKey(null);
    }
  };

  const handleGenerateLineQr = async (student: StudentCoverageRow) => {
    try {
      const targetAcc =
        lineAccounts.find((a) => a.account_type === 'OA') || lineAccounts[0];
      if (!targetAcc) {
        toast.error('Vui lòng thêm ít nhất 1 tài khoản LINE trong mục Tài khoản & Bảo mật trước');
        return;
      }
      const res = await lineApi.generateDeepLink({
        student_id: student.id,
        line_account_id: targetAcc.id,
      });
      setDeepLinkModal({
        studentName: student.full_name,
        linkCode: res.linkCode,
        deepLinkUrl: res.deepLinkUrl,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Không thể tạo mã QR LINE');
    }
  };

  const handleCopySuggestedName = (studentId: number, groupName: string) => {
    navigator.clipboard.writeText(groupName);
    setCopiedId(studentId);
    toast.success(`Đã sao chép tên nhóm chuẩn: "${groupName}"`);
    setTimeout(() => {
      setCopiedId((prev) => (prev === studentId ? null : prev));
    }, 2000);
  };

  // Distinct CS options for dropdown filter
  const csOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      if (s.cs_display && s.cs_display !== 'Chưa phân công CSKH') {
        map.set(s.cs_display, s.cs_display);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [students]);

  // Counts for KPI cards and filter tabs
  const totalCount = students.length;
  const linkedCount = useMemo(
    () => students.filter((s) => s.zaloLinked || s.lineLinked).length,
    [students],
  );
  const unlinkedCount = useMemo(
    () => students.filter((s) => !s.zaloLinked && !s.lineLinked).length,
    [students],
  );
  const unlinkedZaloCount = useMemo(
    () => students.filter((s) => !s.zaloLinked).length,
    [students],
  );
  const unlinkedLineCount = useMemo(
    () => students.filter((s) => !s.lineLinked).length,
    [students],
  );

  const newlyLinkedZalo = careReport?.newlyLinkedZaloCount ?? 0;
  const newlyLinkedLine = careReport?.newlyLinkedLineCount ?? 0;

  // Filtered rows for the Unified Table
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Tab filter
      if (filterTab === 'LINKED' && !s.zaloLinked && !s.lineLinked) return false;
      if (filterTab === 'UNLINKED' && (s.zaloLinked || s.lineLinked)) return false;
      if (filterTab === 'UNLINKED_ZALO' && s.zaloLinked) return false;
      if (filterTab === 'UNLINKED_LINE' && s.lineLinked) return false;

      // CS dropdown filter
      if (selectedCsFilter !== 'ALL' && s.cs_display !== selectedCsFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.full_name.toLowerCase().includes(q);
        const matchExt = s.external_id?.toLowerCase().includes(q);
        const matchPhone = s.phone?.toLowerCase().includes(q);
        const matchCs = s.cs_display.toLowerCase().includes(q);
        const matchSuggested = s.suggested_group_name?.toLowerCase().includes(q);
        const matchZalo = s.zaloRelation?.displayName.toLowerCase().includes(q);
        const matchLine = s.lineRelation?.displayName.toLowerCase().includes(q);
        return Boolean(
          matchName ||
            matchExt ||
            matchPhone ||
            matchCs ||
            matchSuggested ||
            matchZalo ||
            matchLine,
        );
      }
      return true;
    });
  }, [students, filterTab, selectedCsFilter, searchQuery]);

  // Filtered items inside Inline Link Modal
  const filteredModalGroups = useMemo(() => {
    const q = linkModalSearch.trim().toLowerCase();
    const rawList = linkModalPlatform === 'ZALO' ? zaloGroupsList : lineGroupsList;
    if (!q) return rawList;
    return rawList.filter((g: any) => {
      const name = (g.name || '').toLowerCase();
      const gid = String(g.zalo_group_id || g.line_group_id || '').toLowerCase();
      return name.includes(q) || gid.includes(q);
    });
  }, [linkModalPlatform, zaloGroupsList, lineGroupsList, linkModalSearch]);

  const filteredModalFriends = useMemo(() => {
    const q = linkModalSearch.trim().toLowerCase();
    const rawList = linkModalPlatform === 'ZALO' ? zaloFriendsList : lineFriendsList;
    if (!q) return rawList;
    return rawList.filter((f: any) => {
      const name = (
        f.zalo_display_name ||
        f.line_display_name ||
        f.alias_in_nick ||
        ''
      ).toLowerCase();
      const phone = (f.phone_from_sdk || '').toLowerCase();
      const uid = String(f.zalo_uid_in_nick || f.line_uid_in_nick || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || uid.includes(q);
    });
  }, [linkModalPlatform, zaloFriendsList, lineFriendsList, linkModalSearch]);

  return (
    <PageContainer>
      <PageHeader
        title="Liên kết Học viên với Nhóm Chăm sóc (Zalo & LINE)"
        description="Tự động đối chiếu và gắn Nhóm Chăm sóc Zalo/LINE cho từng học viên theo tên nhóm, hoặc chọn gắn thủ công ngay trên danh sách."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadWorkspaceData}
              isLoading={loading}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Làm mới danh sách
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSyncAndMatchCareGroups}
              isLoading={syncingCareGroups}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              {syncingCareGroups
                ? 'Đang đồng bộ & gắn nhóm...'
                : 'Đồng bộ & Tự động Gắn Nhóm'}
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {/* Collapsible / Concise Instruction Card */}
        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-emerald-50/70 p-3.5 shadow-2xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-800 leading-relaxed">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span>Hướng dẫn đặt tên Nhóm Chăm sóc để hệ thống tự động nhận diện</span>
                </div>
                {showGuide && (
                  <p className="mt-1 text-slate-700">
                    Cách đặt tên nhóm trên Zalo / LINE để hệ thống tự động nhận diện:{' '}
                    <strong className="font-mono bg-white border border-blue-200 text-blue-900 px-2 py-0.5 rounded-md">
                      [Số thứ tự CSKH] - [Mã học viên] [Tên học viên]
                    </strong>{' '}
                    (Ví dụ:{' '}
                    <strong className="font-mono bg-emerald-100/80 border border-emerald-300 text-emerald-900 px-2 py-0.5 rounded-md">
                      01 - HV_001 Nguyễn Văn An
                    </strong>{' '}
                    — trong đó <code className="font-mono font-bold text-blue-700">01</code> là mã
                    của nhân viên <code className="font-mono font-bold text-blue-700">CVHT01</code>,{' '}
                    <code className="font-mono font-bold text-emerald-700">HV_001</code> là Mã học
                    viên). Bạn có thể bấm nút <strong>Sao chép</strong> ở cột Tên nhóm chuẩn bên
                    dưới để đặt tên nhóm trên Zalo/LINE.
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg hover:bg-blue-100/60 transition-colors"
            >
              {showGuide ? (
                <>
                  <span>Thu gọn</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>Xem hướng dẫn</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Progress Banner when syncingCareGroups === true */}
        {syncingCareGroups && (
          <div className="rounded-2xl border border-blue-300 bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 p-4 shadow-xs space-y-2.5">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
              <div className="flex-1">
                <div className="text-xs font-bold text-blue-950">
                  {liveSyncStage ||
                    'Đang làm mới danh sách nhóm Zalo/LINE và đối chiếu với hồ sơ học viên...'}
                </div>
                <div className="text-[11px] text-blue-700 mt-0.5">
                  Vui lòng đợi trong giây lát, bảng danh sách bên dưới sẽ tự động cập nhật ngay khi hoàn tất.
                </div>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full w-2/3 bg-gradient-to-r from-blue-600 to-emerald-500 animate-pulse rounded-full" />
            </div>
          </div>
        )}

        {/* 4 Clean KPI Cards (clickable to filter the table below!) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Tổng số học viên */}
          <button
            type="button"
            onClick={() => setFilterTab('ALL')}
            className={`text-left rounded-2xl border p-4 transition-all shadow-2xs ${
              filterTab === 'ALL'
                ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20'
                : 'border-border bg-surface hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-text-secondary">
              <span>Tổng số học viên</span>
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-text-primary">{totalCount}</span>
              <span className="text-xs text-text-muted">học viên</span>
            </div>
            <div className="mt-1 text-[11px] text-text-muted">
              Bấm để xem toàn bộ danh sách
            </div>
          </button>

          {/* Card 2: Đã liên kết đủ / Đã có nhóm */}
          <button
            type="button"
            onClick={() => setFilterTab('LINKED')}
            className={`text-left rounded-2xl border p-4 transition-all shadow-2xs ${
              filterTab === 'LINKED'
                ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                : 'border-emerald-200/90 bg-emerald-50/30 hover:border-emerald-400'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
              <span>Đã liên kết / Đã có nhóm</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-700">{linkedCount}</span>
              <span className="text-xs text-emerald-700">
                / {totalCount} học viên (
                {totalCount > 0 ? Math.round((linkedCount / totalCount) * 100) : 0}%)
              </span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-700/80">
              Đã gắn nhóm Zalo hoặc LINE chăm sóc
            </div>
          </button>

          {/* Card 3: Chưa liên kết (Cần gắn nhóm) */}
          <button
            type="button"
            onClick={() => setFilterTab('UNLINKED')}
            className={`text-left rounded-2xl border p-4 transition-all shadow-2xs ${
              filterTab === 'UNLINKED'
                ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/20'
                : unlinkedCount > 0
                  ? 'border-amber-200 bg-amber-50/30 hover:border-amber-400'
                  : 'border-border bg-surface hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
              <span>Chưa liên kết (Cần gắn nhóm)</span>
              <Unlink2 className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-700">{unlinkedCount}</span>
              <span className="text-xs text-amber-800">học viên chưa có nhóm</span>
            </div>
            <div className="mt-1 text-[11px] text-amber-800/80">
              Bấm để lọc danh sách cần gắn nhóm ngay
            </div>
          </button>

          {/* Card 4: Kết quả đồng bộ gần nhất */}
          <div className="text-left rounded-2xl border border-indigo-200/80 bg-indigo-50/30 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
              <span>Kết quả đồng bộ gần nhất</span>
              <Link2 className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-blue-600 text-white text-xs font-bold">
                +{newlyLinkedZalo} Zalo
              </span>
              <span className="text-xs text-indigo-400">·</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[#06C755] text-white text-xs font-bold">
                +{newlyLinkedLine} LINE
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-indigo-800/80 flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              {careReport?.completedAt ? (
                <span>
                  Quét {careReport.totalZaloGroupsScanned ?? 0} nhóm Zalo,{' '}
                  {careReport.totalLineGroupsScanned ?? 0} nhóm LINE ({careReport.durationMs ?? 0}ms)
                </span>
              ) : (
                <span>Bấm &ldquo;Đồng bộ &amp; Tự động Gắn Nhóm&rdquo; ở góc trên</span>
              )}
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-surface-muted p-1 rounded-xl border border-border">
              {[
                { key: 'ALL', label: `Tất cả (${totalCount})` },
                { key: 'UNLINKED', label: `Chưa liên kết (${unlinkedCount})` },
                { key: 'LINKED', label: `Đã liên kết (${linkedCount})` },
                { key: 'UNLINKED_ZALO', label: `Chưa gắn Zalo (${unlinkedZaloCount})` },
                { key: 'UNLINKED_LINE', label: `Chưa gắn LINE (${unlinkedLineCount})` },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFilterTab(t.key as FilterTab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterTab === t.key
                      ? 'bg-primary text-white shadow-2xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* CSKH Dropdown Filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-text-secondary whitespace-nowrap">
                Nhân viên CSKH:
              </label>
              <select
                value={selectedCsFilter}
                onChange={(e) => setSelectedCsFilter(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-surface-muted/60 focus:bg-surface focus:outline-none"
              >
                <option value="ALL">Tất cả nhân viên CSKH</option>
                {csOptions.map((cs) => (
                  <option key={cs} value={cs}>
                    {cs}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên học viên, mã học viên, SĐT, tên nhân viên CSKH, tên nhóm..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-border bg-surface-muted/50 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* One Unified Table */}
        <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-muted/70 border-b border-border text-[11px] font-bold text-text-muted uppercase">
                  <th className="py-3.5 px-4">Mã HV</th>
                  <th className="py-3.5 px-4">Học viên</th>
                  <th className="py-3.5 px-4">Nhân viên CSKH</th>
                  <th className="py-3.5 px-4">Tên nhóm chuẩn gợi ý</th>
                  <th className="py-3.5 px-4">Nhóm / Tài khoản Zalo</th>
                  <th className="py-3.5 px-4">Nhóm / Tài khoản LINE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-text-muted">
                      <div className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span>Đang tải danh sách liên kết học viên...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-text-muted">
                      Không tìm thấy học viên nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st) => (
                    <tr key={st.id} className="hover:bg-surface-muted/40 transition-colors">
                      {/* 1. Mã HV */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {st.external_id ? (
                          <span className="font-mono font-bold text-primary px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20">
                            {st.external_id}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Chưa có mã
                          </span>
                        )}
                      </td>

                      {/* 2. Học viên */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-text-primary">{st.full_name}</div>
                        <div className="text-[11px] text-text-muted mt-0.5">
                          {st.phone || <span className="italic">Chưa cập nhật SĐT</span>}
                        </div>
                      </td>

                      {/* 3. Nhân viên CSKH */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 text-text-secondary font-medium">
                          <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{st.cs_display}</span>
                        </div>
                      </td>

                      {/* 4. Tên nhóm chuẩn gợi ý */}
                      <td className="py-3.5 px-4">
                        {st.suggested_group_name ? (
                          <div className="inline-flex items-center gap-1.5 bg-surface-muted border border-border rounded-lg px-2.5 py-1">
                            <code className="font-mono font-semibold text-text-primary text-[11px]">
                              {st.suggested_group_name}
                            </code>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopySuggestedName(st.id, st.suggested_group_name!)
                              }
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface border border-border hover:bg-primary/10 text-text-secondary hover:text-primary font-semibold text-[11px] transition-colors"
                              title="Sao chép tên này để đặt tên nhóm Zalo/LINE"
                            >
                              {copiedId === st.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  Đã chép
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Sao chép
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-text-muted italic text-[11px]">
                            Cần cập nhật Mã HV để tạo tên nhóm chuẩn
                          </span>
                        )}
                      </td>

                      {/* 5. Nhóm / Tài khoản Zalo */}
                      <td className="py-3.5 px-4">
                        {st.zaloLinked && st.zaloRelation ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 font-semibold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                                <span className="truncate max-w-[200px]">
                                  {st.zaloRelation.displayName}
                                </span>
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  openInlineLinkModal(
                                    st,
                                    'ZALO',
                                    st.zaloRelation?.targetType || 'GROUP',
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-surface hover:bg-surface-muted text-text-secondary hover:text-text-primary text-[11px] font-medium transition-colors"
                                title="Đổi nhóm hoặc tài khoản Zalo liên kết"
                              >
                                <Pencil className="w-3 h-3" />
                                Đổi
                              </button>

                              <button
                                type="button"
                                disabled={unlinkingKey === `ZALO-${st.id}`}
                                onClick={() => handleUnlinkChannel(st, 'ZALO')}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-700 text-[11px] font-medium transition-colors disabled:opacity-50"
                                title="Gỡ liên kết Zalo này"
                              >
                                <Trash2 className="w-3 h-3" />
                                Gỡ
                              </button>
                            </div>
                            <div className="text-[10px] text-text-muted pl-1 flex items-center gap-1.5">
                              <span>
                                {st.zaloRelation.targetType === 'GROUP'
                                  ? 'Nhóm chăm sóc'
                                  : 'Bạn bè 1-1'}{' '}
                                · {st.zaloRelation.accountName}
                              </span>
                              {st.zaloRelation.newlyLinked && (
                                <span className="text-emerald-600 font-bold">
                                  · Mới gắn tự động
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openInlineLinkModal(st, 'ZALO', 'GROUP')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 font-semibold text-[11px] transition-all shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Gắn nhóm / bạn bè Zalo
                          </button>
                        )}
                      </td>

                      {/* 6. Nhóm / Tài khoản LINE */}
                      <td className="py-3.5 px-4">
                        {st.lineLinked && st.lineRelation ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-800 font-semibold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#06C755]" />
                                <span className="truncate max-w-[200px]">
                                  {st.lineRelation.displayName}
                                </span>
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  openInlineLinkModal(
                                    st,
                                    'LINE',
                                    st.lineRelation?.targetType || 'GROUP',
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-surface hover:bg-surface-muted text-text-secondary hover:text-text-primary text-[11px] font-medium transition-colors"
                                title="Đổi nhóm hoặc tài khoản LINE liên kết"
                              >
                                <Pencil className="w-3 h-3" />
                                Đổi
                              </button>

                              <button
                                type="button"
                                disabled={unlinkingKey === `LINE-${st.id}`}
                                onClick={() => handleUnlinkChannel(st, 'LINE')}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-700 text-[11px] font-medium transition-colors disabled:opacity-50"
                                title="Gỡ liên kết LINE này"
                              >
                                <Trash2 className="w-3 h-3" />
                                Gỡ
                              </button>
                            </div>
                            <div className="text-[10px] text-text-muted pl-1 flex items-center gap-1.5">
                              <span>
                                {st.lineRelation.targetType === 'GROUP'
                                  ? 'Nhóm chăm sóc'
                                  : 'Liên hệ 1-1'}{' '}
                                · {st.lineRelation.accountName}
                              </span>
                              {st.lineRelation.newlyLinked && (
                                <span className="text-emerald-600 font-bold">
                                  · Mới gắn tự động
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openInlineLinkModal(st, 'LINE', 'GROUP')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-[#06C755] text-emerald-800 hover:text-white border border-emerald-200 font-semibold text-[11px] transition-all shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Gắn nhóm LINE
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGenerateLineQr(st)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-muted hover:bg-[#06C755]/15 text-text-secondary hover:text-emerald-800 border border-border font-semibold text-[11px] transition-colors"
                              title="Tạo mã QR để Học viên / Phụ huynh quét liên kết LINE tự động"
                            >
                              <QrCode className="w-3.5 h-3.5 text-[#06C755]" />
                              Mã QR
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Inline Link Modal (Gắn Liên kết Zalo / LINE cho Học viên) */}
      <Modal
        isOpen={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        title={
          linkModalStudent
            ? `Gắn Liên kết ${linkModalPlatform === 'ZALO' ? 'Zalo' : 'LINE'} cho Học viên: ${linkModalStudent.full_name}`
            : 'Gắn Liên kết cho Học viên'
        }
        size="lg"
      >
        {linkModalStudent && (
          <div className="space-y-4">
            {/* Student Summary Banner */}
            <div className="p-3.5 rounded-xl bg-surface-muted border border-border flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <div className="font-bold text-text-primary">
                  {linkModalStudent.full_name}{' '}
                  {linkModalStudent.external_id && (
                    <span className="font-mono text-primary">
                      ({linkModalStudent.external_id})
                    </span>
                  )}
                </div>
                <div className="text-text-muted mt-0.5">
                  SĐT: {linkModalStudent.phone || 'Chưa có'} · CSKH: {linkModalStudent.cs_display}
                </div>
              </div>
              {linkModalStudent.suggested_group_name && (
                <div className="text-right">
                  <div className="text-[10px] text-text-muted uppercase font-semibold">
                    Tên nhóm chuẩn gợi ý
                  </div>
                  <code className="font-mono font-bold text-primary text-xs">
                    {linkModalStudent.suggested_group_name}
                  </code>
                </div>
              )}
            </div>

            {/* Mode Switcher: Tab 1 (GROUP) vs Tab 2 (USER) */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-surface-muted rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setLinkModalTargetType('GROUP')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  linkModalTargetType === 'GROUP'
                    ? linkModalPlatform === 'ZALO'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-[#06C755] text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Users className="w-4 h-4" />
                Chọn Nhóm Chăm sóc (Khuyên dùng)
              </button>
              <button
                type="button"
                onClick={() => setLinkModalTargetType('USER')}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  linkModalTargetType === 'USER'
                    ? linkModalPlatform === 'ZALO'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-[#06C755] text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <User className="w-4 h-4" />
                Chọn Bạn bè cá nhân 1-1
              </button>
            </div>

            {/* Account Selector */}
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1.5">
                Chọn tài khoản {linkModalPlatform === 'ZALO' ? 'Zalo' : 'LINE'} quản lý:
              </label>
              <select
                value={linkModalAccountId}
                onChange={(e) => setLinkModalAccountId(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs font-semibold rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {linkModalPlatform === 'ZALO' ? (
                  zaloAccounts.length === 0 ? (
                    <option value={0}>— Chưa có tài khoản Zalo nào —</option>
                  ) : (
                    zaloAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.display_name || `Zalo #${acc.id}`}{' '}
                        {acc.zalo_phone ? `(${acc.zalo_phone})` : ''} —{' '}
                        {(acc.liveStatus || acc.status) === 'ACTIVE'
                          ? 'Đang kết nối'
                          : 'Chưa kết nối'}
                      </option>
                    ))
                  )
                ) : lineAccounts.length === 0 ? (
                  <option value={0}>— Chưa có tài khoản LINE nào —</option>
                ) : (
                  lineAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      [{acc.account_type === 'OA' ? 'LINE Official Account' : 'LINE Cá nhân'}]{' '}
                      {acc.display_name || `LINE #${acc.id}`} —{' '}
                      {(acc.liveStatus || acc.status) === 'ACTIVE'
                        ? 'Đang kết nối'
                        : 'Chưa kết nối'}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Search Box */}
            <Input
              value={linkModalSearch}
              onChange={(e) => setLinkModalSearch(e.target.value)}
              placeholder={
                linkModalTargetType === 'GROUP'
                  ? 'Tìm theo tên nhóm chăm sóc hoặc mã học viên...'
                  : 'Tìm theo tên hiển thị hoặc số điện thoại...'
              }
              leftIcon={<Search className="w-4 h-4 text-text-muted" />}
            />

            {/* Items List */}
            <div className="border border-border rounded-xl max-h-72 overflow-y-auto divide-y divide-border/60 bg-surface">
              {linkModalLoadingItems ? (
                <div className="py-10 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Đang tải danh sách từ tài khoản...</span>
                </div>
              ) : linkModalTargetType === 'GROUP' ? (
                filteredModalGroups.length === 0 ? (
                  <div className="py-10 px-4 text-center text-xs text-text-muted space-y-1">
                    <p className="font-semibold text-text-secondary">
                      Không tìm thấy nhóm nào trong tài khoản này.
                    </p>
                    <p>
                      Hãy kiểm tra lại từ khóa tìm kiếm hoặc bấm &ldquo;Đồng bộ &amp; Tự động Gắn
                      Nhóm&rdquo; ở ngoài trang để cập nhật danh sách nhóm mới nhất.
                    </p>
                  </div>
                ) : (
                  filteredModalGroups.map((g: any) => {
                    const gId = g.id;
                    const isSelected = selectedGroupItem?.id === gId;
                    const extGroupId = g.zalo_group_id || g.line_group_id;
                    const memberCount = g.member_count ?? g.memberCount ?? '—';
                    return (
                      <button
                        key={`${extGroupId}-${gId}`}
                        type="button"
                        onClick={() => setSelectedGroupItem(g)}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                          isSelected
                            ? 'bg-primary/10 border-l-4 border-l-primary'
                            : 'hover:bg-surface-muted/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-text-primary truncate">
                            {g.name || `Nhóm #${extGroupId}`}
                          </div>
                          <div className="text-[11px] text-text-muted mt-0.5">
                            Thành viên: <strong>{memberCount}</strong> · Mã nhóm: {extGroupId}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-white text-[11px] font-bold shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            Đã chọn
                          </span>
                        )}
                      </button>
                    );
                  })
                )
              ) : filteredModalFriends.length === 0 ? (
                <div className="py-10 px-4 text-center text-xs text-text-muted">
                  Không tìm thấy bạn bè / liên hệ cá nhân nào khớp từ khóa.
                </div>
              ) : (
                filteredModalFriends.map((f: any) => {
                  const fId = f.id;
                  const isSelected = selectedFriendItem?.id === fId;
                  const displayName =
                    f.zalo_display_name ||
                    f.line_display_name ||
                    f.alias_in_nick ||
                    'Người dùng';
                  const uid = f.zalo_uid_in_nick || f.line_uid_in_nick;
                  return (
                    <button
                      key={`${uid}-${fId}`}
                      type="button"
                      onClick={() => setSelectedFriendItem(f)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                        isSelected
                          ? 'bg-primary/10 border-l-4 border-l-primary'
                          : 'hover:bg-surface-muted/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-text-primary truncate">
                          {displayName}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5">
                          {f.phone_from_sdk ? `SĐT: ${f.phone_from_sdk} · ` : ''}Mã: {uid}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-white text-[11px] font-bold shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          Đã chọn
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" type="button" onClick={() => setLinkModalOpen(false)}>
                Hủy
              </Button>
              <Button
                variant="primary"
                type="button"
                isLoading={linkModalSaving}
                disabled={
                  linkModalTargetType === 'GROUP' ? !selectedGroupItem : !selectedFriendItem
                }
                onClick={handleSaveInlineLink}
                leftIcon={<Link2 className="w-4 h-4" />}
              >
                Lưu liên kết cho học viên
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 2-Tap LINE OA QR Modal */}
      <Modal
        isOpen={Boolean(deepLinkModal)}
        onClose={() => setDeepLinkModal(null)}
        title={
          deepLinkModal
            ? `Mã QR Liên kết LINE cho học viên ${deepLinkModal.studentName}`
            : 'Mã QR Liên kết LINE'
        }
        size="sm"
      >
        {deepLinkModal && (
          <div className="space-y-4 text-center">
            <p className="text-xs text-text-secondary leading-relaxed">
              Phụ huynh hoặc Học viên chỉ cần dùng điện thoại quét mã QR dưới đây và bấm{' '}
              <strong>Gửi</strong> tin nhắn có sẵn mã xác nhận{' '}
              <strong className="text-primary font-mono">{deepLinkModal.linkCode}</strong> để hệ
              thống tự động gắn liên kết ngay lập tức.
            </p>
            <div className="flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  deepLinkModal.deepLinkUrl,
                )}`}
                alt="LINE Deep Link QR"
                className="w-48 h-48 rounded-xl border border-border p-2 bg-white"
              />
            </div>
            <div className="p-2.5 rounded-xl bg-surface-muted text-[11px] font-mono break-all flex items-center justify-between gap-2 border border-border">
              <span className="truncate">{deepLinkModal.deepLinkUrl}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(deepLinkModal.deepLinkUrl);
                  toast.success('Đã sao chép đường dẫn liên kết LINE!');
                }}
                className="px-2 py-1 rounded-lg bg-surface border border-border hover:bg-primary/10 text-text-secondary hover:text-primary font-sans font-semibold shrink-0 flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                Sao chép
              </button>
            </div>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => setDeepLinkModal(null)}
            >
              Đóng
            </Button>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};
