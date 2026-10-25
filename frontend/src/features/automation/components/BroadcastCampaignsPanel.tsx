import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { automationApi } from '../api/automation.api';
import type {
  BroadcastCampaign,
  BroadcastRecipient,
  BroadcastTargetsCatalog,
  BroadcastChannelMode,
  BroadcastScheduleType,
  BroadcastTargetStudentItem,
  BroadcastTargetZaloGroupItem,
  BroadcastTargetLineGroupItem,
  CreateBroadcastCampaignDTO,
  RichMessageMetadata,
} from '../types/automation.types';
import {
  BROADCAST_CHANNEL_MODE_LABELS,
  BROADCAST_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
} from '../types/automation.types';
import {
  RichChatComposer,
  renderFormattedRichText,
  isImageAttachment,
  formatBytes,
} from './RichChatComposer';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import { useSocket } from '../../../hooks/useSocket';
import {
  Plus,
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Eye,
  Trash2,
  RotateCcw,
  Ban,
  Users,
  MessageSquare,
  Search,
  CheckSquare,
  Radio,
  Layers,
  Loader2,
  Paperclip,
  Link2,
  ExternalLink,
  FileText,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTimeVN(isoStr?: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDefaultScheduledDateTimeLocal(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000); // +30 mins from now
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface NormalizedCatalogStudent {
  id: number;
  externalId: string;
  fullName: string;
  phone: string;
  csName: string;
  csDisplay: string;
  className: string;
  packageName: string;
  teacherName: string;
  remainingSessions: string;
  zaloLinked: boolean;
  zaloTargetLabel: string;
  lineLinked: boolean;
  lineTargetLabel: string;
}

function normalizeStudentItem(s: BroadcastTargetStudentItem): NormalizedCatalogStudent {
  const firstEnr = Array.isArray(s.enrollments) ? s.enrollments[0] : null;
  const firstCls = firstEnr?.enrollment_classes?.[0]?.class;
  const firstTeacher = firstCls?.class_teachers?.[0]?.teacher?.name;

  const csName = s.cs_name || firstEnr?.cs?.name || '';
  const csCode = s.cs_code || firstEnr?.cs?.code || '';
  const csDisplay = csName
    ? csCode && !csName.toUpperCase().includes(csCode.toUpperCase())
      ? `${csName} (${csCode})`
      : csName
    : csCode || 'Chưa phân công';

  const className =
    s.class_name ||
    (firstCls ? `${firstCls.class_name}${firstCls.class_code ? ` (${firstCls.class_code})` : ''}` : '') ||
    'Chưa xếp lớp';

  const packageName = s.package_name || firstEnr?.package?.name || 'Tiêu chuẩn';
  const teacherName = s.teacher_name || firstTeacher || 'Giáo viên phụ trách';
  const remainingSessions =
    s.remaining_sessions != null ? String(s.remaining_sessions) : '10';

  const zaloRel = Array.isArray(s.zalo_contact_relations) ? s.zalo_contact_relations[0] : null;
  const zaloGroupName =
    s.zalo_group_name ||
    s.zaloGroupName ||
    s.zalo_target_name ||
    zaloRel?.zalo_group?.name ||
    zaloRel?.display_name ||
    '';
  const zaloLinked = Boolean(
    s.zalo_linked ?? s.zaloLinked ?? (zaloRel || zaloGroupName)
  );

  const lineRel = Array.isArray(s.line_contact_relations) ? s.line_contact_relations[0] : null;
  const lineGroupName =
    s.line_group_name ||
    s.lineGroupName ||
    s.line_target_name ||
    lineRel?.line_group?.name ||
    lineRel?.display_name ||
    '';
  const lineLinked = Boolean(
    s.line_linked ?? s.lineLinked ?? (lineRel || lineGroupName)
  );

  return {
    id: Number(s.id),
    externalId: s.external_id || `#${s.id}`,
    fullName: s.full_name || `Học viên #${s.id}`,
    phone: s.phone || '',
    csName: csName || 'Chưa phân công',
    csDisplay,
    className,
    packageName,
    teacherName,
    remainingSessions,
    zaloLinked,
    zaloTargetLabel: zaloGroupName || (zaloLinked ? 'Đã liên kết Zalo' : 'Chưa gắn nhóm Zalo'),
    lineLinked,
    lineTargetLabel: lineGroupName || (lineLinked ? 'Đã liên kết LINE' : 'Chưa gắn nhóm LINE'),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface BroadcastCampaignsPanelProps {
  externalCreateTrigger?: number;
}

export const BroadcastCampaignsPanel: React.FC<BroadcastCampaignsPanelProps> = ({
  externalCreateTrigger,
}) => {
  const toast = useToast();
  const { on, off } = useSocket();

  // Campaign list state
  const [campaigns, setCampaigns] = useState<BroadcastCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<
    (BroadcastCampaign & { recipients: BroadcastRecipient[] }) | null
  >(null);
  const [recipientFilter, setRecipientFilter] = useState<string>('ALL');
  const [recipientSearch, setRecipientSearch] = useState('');

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<BroadcastCampaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Create modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalog, setCatalog] = useState<BroadcastTargetsCatalog>({
    students: [],
    zaloGroups: [],
    lineGroups: [],
    zaloAccounts: [],
    lineAccounts: [],
  });
  const [creating, setCreating] = useState(false);

  // Create form fields
  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [scheduleType, setScheduleType] = useState<BroadcastScheduleType>('IMMEDIATE');
  const [scheduledAt, setScheduledAt] = useState<string>(getDefaultScheduledDateTimeLocal());
  const [channelMode, setChannelMode] = useState<BroadcastChannelMode>('AUTO');
  const [messageContent, setMessageContent] = useState(
    '[big][b]THÔNG BÁO LỊCH HỌC TUẦN MỚI[/b][/big]\nXin chào phụ huynh và học viên [b]{{student_name}}[/b] ({{class_name}}),\n• Hiện học viên còn [orange][b]{{remaining_sessions}} buổi[/b][/orange] trong gói {{enrollment_package}}.\n• Mọi thắc mắc vui lòng liên hệ CSKH [green]{{cs_name}}[/green] để được hỗ trợ nhanh nhất!'
  );
  const [messageMetadata, setMessageMetadata] = useState<RichMessageMetadata>({
    urgency: 0,
    attachments: [],
    links: [],
  });

  // Target selection tabs & state
  const [targetTab, setTargetTab] = useState<'STUDENTS' | 'ZALO_GROUPS' | 'LINE_GROUPS'>('STUDENTS');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [selectedZaloGroupIds, setSelectedZaloGroupIds] = useState<number[]>([]);
  const [selectedLineGroupIds, setSelectedLineGroupIds] = useState<number[]>([]);

  // Filters inside target selector
  const [studentSearch, setStudentSearch] = useState('');
  const [studentCsFilter, setStudentCsFilter] = useState('ALL');
  const [studentClassFilter, setStudentClassFilter] = useState('ALL');
  const [studentLinkFilter, setStudentLinkFilter] = useState<'ALL' | 'LINKED_ANY' | 'ZALO' | 'LINE'>('ALL');

  const [zaloGroupSearch, setZaloGroupSearch] = useState('');
  const [zaloAccountFilter, setZaloAccountFilter] = useState('ALL');

  const [lineGroupSearch, setLineGroupSearch] = useState('');
  const [lineAccountFilter, setLineAccountFilter] = useState('ALL');

  // ─── Fetch Campaigns ────────────────────────────────────────────────────────

  const fetchCampaigns = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const res = await automationApi.listBroadcasts({ limit: 200 });
      setCampaigns(res.items ?? []);
    } catch (err: any) {
      if (!opts?.silent) {
        toast.error(
          err.response?.data?.message || 'Không thể tải danh sách chiến dịch gửi tin đa kênh'
        );
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Open Create Modal when triggered externally
  useEffect(() => {
    if (externalCreateTrigger && externalCreateTrigger > 0) {
      openCreateModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalCreateTrigger]);

  // ─── Socket.IO Live Updates ─────────────────────────────────────────────────

  useEffect(() => {
    const handleProgress = (payload: any) => {
      if (!payload) return;
      const campaignId = Number(payload.campaignId ?? payload.campaign_id ?? payload.id);
      if (!campaignId) return;

      setCampaigns((prev) =>
        prev.map((c) => {
          if (c.id !== campaignId) return c;
          return {
            ...c,
            status: payload.status ?? 'SENDING',
            sent_count: payload.sentCount ?? payload.sent_count ?? c.sent_count,
            failed_count: payload.failedCount ?? payload.failed_count ?? c.failed_count,
            skipped_count: payload.skippedCount ?? payload.skipped_count ?? c.skipped_count,
            total_recipients:
              payload.totalRecipients ?? payload.total_recipients ?? c.total_recipients,
          };
        })
      );

      setSelectedCampaign((prev) => {
        if (!prev || prev.id !== campaignId) return prev;
        const updatedRecipients = prev.recipients.map((r) => {
          if (payload.recipientId && r.id === Number(payload.recipientId)) {
            return {
              ...r,
              status: payload.recipientStatus ?? r.status,
              sent_at: payload.sentAt ?? r.sent_at,
              error_message: payload.errorMessage ?? r.error_message,
            };
          }
          return r;
        });
        return {
          ...prev,
          status: payload.status ?? 'SENDING',
          sent_count: payload.sentCount ?? payload.sent_count ?? prev.sent_count,
          failed_count: payload.failedCount ?? payload.failed_count ?? prev.failed_count,
          skipped_count: payload.skippedCount ?? payload.skipped_count ?? prev.skipped_count,
          recipients: updatedRecipients,
        };
      });
    };

    const handleCompleted = (payload: any) => {
      handleProgress(payload);
      fetchCampaigns({ silent: true });
      const campaignId = Number(payload?.campaignId ?? payload?.campaign_id ?? payload?.id);
      if (campaignId && selectedCampaign?.id === campaignId) {
        automationApi
          .getBroadcastDetail(campaignId)
          .then((res) => setSelectedCampaign(res.campaign))
          .catch(() => {});
      }
    };

    on('broadcast:progress', handleProgress);
    on('broadcast:completed', handleCompleted);

    return () => {
      off('broadcast:progress', handleProgress);
      off('broadcast:completed', handleCompleted);
    };
  }, [on, off, fetchCampaigns, selectedCampaign?.id]);

  // ─── KPI Metrics ────────────────────────────────────────────────────────────

  const kpiStats = useMemo(() => {
    const totalCampaigns = campaigns.length;
    const scheduledCount = campaigns.filter((c) => c.status === 'SCHEDULED').length;
    const totalSentMessages = campaigns.reduce((sum, c) => sum + (Number(c.sent_count) || 0), 0);
    const activeOrCompletedCount = campaigns.filter(
      (c) => c.status === 'COMPLETED' || c.status === 'SENDING' || c.status === 'PARTIAL_FAILED'
    ).length;
    const sendingNowCount = campaigns.filter((c) => c.status === 'SENDING').length;

    return {
      totalCampaigns,
      scheduledCount,
      totalSentMessages,
      activeOrCompletedCount,
      sendingNowCount,
    };
  }, [campaigns]);

  // ─── Filtered Campaigns ─────────────────────────────────────────────────────

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = c.name?.toLowerCase().includes(q);
        const matchDesc = c.description?.toLowerCase().includes(q);
        const matchMsg = c.message_content?.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchMsg) return false;
      }
      return true;
    });
  }, [campaigns, statusFilter, searchQuery]);

  // ─── Load Targets Catalog & Open Create Modal ───────────────────────────────

  const loadTargetsCatalog = async () => {
    try {
      setCatalogLoading(true);
      const data = await automationApi.getBroadcastTargetsCatalog();
      setCatalog(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh bạ đích nhận tin');
    } finally {
      setCatalogLoading(false);
    }
  };

  const openCreateModal = () => {
    setCampaignName('');
    setCampaignDescription('');
    setScheduleType('IMMEDIATE');
    setScheduledAt(getDefaultScheduledDateTimeLocal());
    setChannelMode('AUTO');
    setMessageMetadata({
      urgency: 0,
      attachments: [],
      links: [],
    });
    setSelectedStudentIds([]);
    setSelectedZaloGroupIds([]);
    setSelectedLineGroupIds([]);
    setStudentSearch('');
    setZaloGroupSearch('');
    setLineGroupSearch('');
    setTargetTab('STUDENTS');
    setCreateModalOpen(true);
    loadTargetsCatalog();
  };

  // ─── Normalized Catalog Lists & Filters ─────────────────────────────────────

  const normalizedStudents = useMemo(
    () => (catalog.students ?? []).map(normalizeStudentItem),
    [catalog.students]
  );

  const csOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of normalizedStudents) {
      if (s.csDisplay && s.csDisplay !== 'Chưa phân công') set.add(s.csDisplay);
    }
    return Array.from(set).sort();
  }, [normalizedStudents]);

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of normalizedStudents) {
      if (s.className && s.className !== 'Chưa xếp lớp') set.add(s.className);
    }
    return Array.from(set).sort();
  }, [normalizedStudents]);

  const filteredStudents = useMemo(() => {
    return normalizedStudents.filter((s) => {
      if (studentCsFilter !== 'ALL' && s.csDisplay !== studentCsFilter) return false;
      if (studentClassFilter !== 'ALL' && s.className !== studentClassFilter) return false;
      if (studentLinkFilter === 'LINKED_ANY' && !s.zaloLinked && !s.lineLinked) return false;
      if (studentLinkFilter === 'ZALO' && !s.zaloLinked) return false;
      if (studentLinkFilter === 'LINE' && !s.lineLinked) return false;

      if (studentSearch.trim()) {
        const q = studentSearch.toLowerCase().trim();
        const match =
          s.fullName.toLowerCase().includes(q) ||
          s.externalId.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q) ||
          s.csDisplay.toLowerCase().includes(q) ||
          s.className.toLowerCase().includes(q) ||
          s.zaloTargetLabel.toLowerCase().includes(q) ||
          s.lineTargetLabel.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [normalizedStudents, studentCsFilter, studentClassFilter, studentLinkFilter, studentSearch]);

  const zaloAccMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of catalog.zaloAccounts ?? []) {
      map.set(a.id, a.display_name || `Zalo #${a.id}`);
    }
    return map;
  }, [catalog.zaloAccounts]);

  const lineAccMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of catalog.lineAccounts ?? []) {
      map.set(a.id, a.display_name || `LINE #${a.id}`);
    }
    return map;
  }, [catalog.lineAccounts]);

  const filteredZaloGroups = useMemo(() => {
    return (catalog.zaloGroups ?? []).filter((g) => {
      if (zaloAccountFilter !== 'ALL' && String(g.zalo_account_id) !== zaloAccountFilter) {
        return false;
      }
      if (zaloGroupSearch.trim()) {
        const q = zaloGroupSearch.toLowerCase().trim();
        const name = (g.name || '').toLowerCase();
        const gid = (g.zalo_group_id || '').toLowerCase();
        const accName = (
          g.zalo_account?.display_name ||
          g.account_name ||
          zaloAccMap.get(g.zalo_account_id) ||
          ''
        ).toLowerCase();
        if (!name.includes(q) && !gid.includes(q) && !accName.includes(q)) return false;
      }
      return true;
    });
  }, [catalog.zaloGroups, zaloAccountFilter, zaloGroupSearch, zaloAccMap]);

  const filteredLineGroups = useMemo(() => {
    return (catalog.lineGroups ?? []).filter((g) => {
      if (lineAccountFilter !== 'ALL' && String(g.line_account_id) !== lineAccountFilter) {
        return false;
      }
      if (lineGroupSearch.trim()) {
        const q = lineGroupSearch.toLowerCase().trim();
        const name = (g.name || '').toLowerCase();
        const gid = (g.line_group_id || '').toLowerCase();
        const accName = (
          g.line_account?.display_name ||
          g.account_name ||
          lineAccMap.get(g.line_account_id) ||
          ''
        ).toLowerCase();
        if (!name.includes(q) && !gid.includes(q) && !accName.includes(q)) return false;
      }
      return true;
    });
  }, [catalog.lineGroups, lineAccountFilter, lineGroupSearch, lineAccMap]);

  // ─── Selection Handlers ─────────────────────────────────────────────────────

  const toggleStudent = (id: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllLinkedStudents = () => {
    const linkedIds = filteredStudents
      .filter((s) => {
        if (channelMode === 'ZALO_ONLY') return s.zaloLinked;
        if (channelMode === 'LINE_ONLY') return s.lineLinked;
        return s.zaloLinked || s.lineLinked;
      })
      .map((s) => s.id);

    setSelectedStudentIds((prev) => {
      const set = new Set([...prev, ...linkedIds]);
      return Array.from(set);
    });
    toast.success(`Đã chọn thêm ${linkedIds.length} học viên đã liên kết kênh chăm sóc`);
  };

  const clearStudentsSelection = () => setSelectedStudentIds([]);

  const toggleZaloGroup = (id: number) => {
    setSelectedZaloGroupIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllFilteredZaloGroups = () => {
    const ids = filteredZaloGroups.map((g) => g.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedZaloGroupIds.includes(id));
    if (allSelected) {
      setSelectedZaloGroupIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedZaloGroupIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const toggleLineGroup = (id: number) => {
    setSelectedLineGroupIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllFilteredLineGroups = () => {
    const ids = filteredLineGroups.map((g) => g.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedLineGroupIds.includes(id));
    if (allSelected) {
      setSelectedLineGroupIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedLineGroupIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  // ─── Live Preview Sample Student ───────────────────────────────────────────

  const previewSampleStudent = useMemo(() => {
    if (selectedStudentIds.length > 0) {
      const found = normalizedStudents.find((s) => s.id === selectedStudentIds[0]);
      if (found) return found;
    }
    return normalizedStudents[0] ?? null;
  }, [selectedStudentIds, normalizedStudents]);

  // ─── Submit Create Broadcast ────────────────────────────────────────────────

  const totalSelectedTargets =
    selectedStudentIds.length + selectedZaloGroupIds.length + selectedLineGroupIds.length;

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) {
      toast.warning('Vui lòng nhập tên chiến dịch gửi tin');
      return;
    }
    if (
      !messageContent.trim() &&
      !(messageMetadata.attachments?.length) &&
      !(messageMetadata.links?.length)
    ) {
      toast.warning('Vui lòng nhập nội dung tin nhắn hoặc đính kèm Ảnh/File/Link');
      return;
    }
    if (totalSelectedTargets === 0) {
      toast.warning('Vui lòng chọn ít nhất 1 Học viên hoặc Nhóm Zalo / Nhóm LINE nhận tin');
      return;
    }
    if (scheduleType === 'SCHEDULED') {
      if (!scheduledAt) {
        toast.warning('Vui lòng chọn ngày & giờ hẹn phát');
        return;
      }
      const scheduledDate = new Date(scheduledAt);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now() - 60000) {
        toast.warning('Thời gian hẹn giờ phải nằm trong tương lai');
        return;
      }
    }

    const dto: CreateBroadcastCampaignDTO = {
      name: campaignName.trim(),
      description: campaignDescription.trim() || undefined,
      message_content: messageContent,
      message_metadata: messageMetadata,
      channel_mode: channelMode,
      schedule_type: scheduleType,
      scheduled_at:
        scheduleType === 'SCHEDULED' && scheduledAt
          ? new Date(scheduledAt).toISOString()
          : null,
      student_ids: selectedStudentIds,
      zalo_group_ids: selectedZaloGroupIds,
      line_group_ids: selectedLineGroupIds,
    };

    try {
      setCreating(true);
      await automationApi.createBroadcast(dto);
      toast.success(
        scheduleType === 'IMMEDIATE'
          ? 'Đã tạo chiến dịch và bắt đầu phát tin đa kênh!'
          : 'Đã lên lịch chiến dịch gửi tin hẹn giờ thành công!'
      );
      setCreateModalOpen(false);
      fetchCampaigns();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tạo chiến dịch gửi tin');
    } finally {
      setCreating(false);
    }
  };

  // ─── Row Actions (Detail, Send Now, Cancel, Retry, Delete) ──────────────────

  const openDetailModal = async (campaign: BroadcastCampaign) => {
    setDetailModalOpen(true);
    setDetailLoading(true);
    setRecipientFilter('ALL');
    setRecipientSearch('');
    try {
      const res = await automationApi.getBroadcastDetail(campaign.id);
      setSelectedCampaign(res.campaign);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải chi tiết chiến dịch');
      setDetailModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSendNow = async (campaign: BroadcastCampaign) => {
    try {
      setActionLoadingId(campaign.id);
      await automationApi.sendBroadcastNow(campaign.id);
      toast.success(`Đã kích hoạt phát ngay chiến dịch "${campaign.name}"`);
      fetchCampaigns();
      if (selectedCampaign?.id === campaign.id) {
        const res = await automationApi.getBroadcastDetail(campaign.id);
        setSelectedCampaign(res.campaign);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể kích hoạt phát ngay');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelScheduled = async (campaign: BroadcastCampaign) => {
    try {
      setActionLoadingId(campaign.id);
      await automationApi.cancelBroadcast(campaign.id);
      toast.success(`Đã hủy lịch phát chiến dịch "${campaign.name}"`);
      fetchCampaigns();
      if (selectedCampaign?.id === campaign.id) {
        const res = await automationApi.getBroadcastDetail(campaign.id);
        setSelectedCampaign(res.campaign);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể hủy lịch chiến dịch');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRetryFailed = async (campaign: BroadcastCampaign) => {
    try {
      setActionLoadingId(campaign.id);
      const res = await automationApi.retryBroadcastFailed(campaign.id);
      toast.success(
        res?.message || `Đã đưa các tin lỗi của chiến dịch "${campaign.name}" vào hàng đợi gửi lại`
      );
      fetchCampaigns();
      if (selectedCampaign?.id === campaign.id) {
        const detail = await automationApi.getBroadcastDetail(campaign.id);
        setSelectedCampaign(detail.campaign);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể gửi lại tin lỗi');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await automationApi.deleteBroadcast(deleteTarget.id);
      toast.success(`Đã xóa chiến dịch "${deleteTarget.name}"`);
      if (selectedCampaign?.id === deleteTarget.id) {
        setDetailModalOpen(false);
        setSelectedCampaign(null);
      }
      setDeleteTarget(null);
      fetchCampaigns();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa chiến dịch');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Table Columns ──────────────────────────────────────────────────────────

  const columns: Column<BroadcastCampaign>[] = [
    {
      header: 'Tên chiến dịch & Nội dung mẫu',
      cell: (item) => {
        const meta = item.message_metadata;
        const urgency = meta?.urgency ?? 0;
        const attCount = meta?.attachments?.length ?? 0;
        const linkCount = meta?.links?.length ?? 0;

        return (
          <div className="max-w-md">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-text-primary text-sm">{item.name}</span>
              {urgency === 2 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-[#db342e] border border-rose-200">
                  <AlertCircle className="w-3 h-3" />
                  <span>!! Khẩn cấp</span>
                </span>
              )}
              {urgency === 1 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-[#f27806] border border-amber-200">
                  <AlertTriangle className="w-3 h-3" />
                  <span>! Quan trọng</span>
                </span>
              )}
              {attCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Paperclip className="w-3 h-3" />
                  <span>📎 {attCount} tệp</span>
                </span>
              )}
              {linkCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Link2 className="w-3 h-3" />
                  <span>🔗 {linkCount} link</span>
                </span>
              )}
            </div>
            {item.description && (
              <div className="text-xs text-text-secondary mt-0.5 line-clamp-1">
                {item.description}
              </div>
            )}
            <div className="mt-1.5 text-xs text-text-primary bg-surface-muted/80 border border-border/60 rounded-lg px-2.5 py-1.5 line-clamp-2 whitespace-pre-wrap font-normal">
              {renderFormattedRichText(item.message_content)}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Kênh & Chế độ phát',
      cell: (item) => {
        const modeLabel =
          BROADCAST_CHANNEL_MODE_LABELS[item.channel_mode] || item.channel_mode;
        const isZalo = item.channel_mode === 'ZALO_ONLY';
        const isLine = item.channel_mode === 'LINE_ONLY';

        return (
          <div className="space-y-1.5">
            <div>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  isZalo
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : isLine
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}
              >
                <Radio className="w-3 h-3" />
                {modeLabel}
              </span>
            </div>
            <div className="text-xs text-text-secondary flex items-center gap-1.5">
              {item.schedule_type === 'SCHEDULED' ? (
                <>
                  <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    Hẹn giờ:{' '}
                    <strong className="text-text-primary">
                      {formatDateTimeVN(item.scheduled_at)}
                    </strong>
                  </span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>
                    Gửi ngay{' '}
                    <span className="text-text-muted">
                      ({formatDateTimeVN(item.created_at)})
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Tiến độ gửi (sent / total)',
      cell: (item) => {
        const total = Math.max(Number(item.total_recipients) || 0, 0);
        const sent = Math.max(Number(item.sent_count) || 0, 0);
        const failed = Math.max(Number(item.failed_count) || 0, 0);
        const skipped = Math.max(Number(item.skipped_count) || 0, 0);

        const denom = total > 0 ? total : 1;
        const sentPct = Math.min(100, Math.round((sent / denom) * 100));
        const failedPct = Math.min(100 - sentPct, Math.round((failed / denom) * 100));
        const skippedPct = Math.min(
          100 - sentPct - failedPct,
          Math.round((skipped / denom) * 100)
        );

        return (
          <div className="min-w-[180px] max-w-[220px]">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-text-primary">
                {sent} / {total} đích nhận
              </span>
              <span className="text-text-muted font-medium">
                {total > 0 ? `${Math.round(((sent + failed + skipped) / total) * 100)}%` : '0%'}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex border border-border/60">
              {sentPct > 0 && (
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${sentPct}%` }}
                  title={`Thành công: ${sent}`}
                />
              )}
              {failedPct > 0 && (
                <div
                  className="bg-rose-500 h-full transition-all duration-300"
                  style={{ width: `${failedPct}%` }}
                  title={`Lỗi: ${failed}`}
                />
              )}
              {skippedPct > 0 && (
                <div
                  className="bg-amber-400 h-full transition-all duration-300"
                  style={{ width: `${skippedPct}%` }}
                  title={`Bỏ qua: ${skipped}`}
                />
              )}
            </div>
            <div className="flex items-center gap-2.5 mt-1.5 text-[11px]">
              <span className="text-emerald-700 font-semibold">Đã gửi: {sent}</span>
              {failed > 0 && (
                <span className="text-rose-600 font-semibold">Lỗi: {failed}</span>
              )}
              {skipped > 0 && (
                <span className="text-amber-700 font-semibold">Bỏ qua: {skipped}</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Trạng thái',
      cell: (item) => {
        const st = BROADCAST_STATUS_LABELS[item.status] || {
          label: item.status,
          variant: 'neutral' as const,
        };
        return (
          <Badge variant={st.variant} dot>
            {st.label}
          </Badge>
        );
      },
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      cell: (item) => {
        const isBusy = actionLoadingId === item.id;
        return (
          <div
            className="flex items-center justify-end gap-1.5 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Eye className="w-3.5 h-3.5" />}
              onClick={() => openDetailModal(item)}
            >
              Xem chi tiết
            </Button>

            {item.status === 'SCHEDULED' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isBusy}
                  leftIcon={<Send className="w-3.5 h-3.5" />}
                  onClick={() => handleSendNow(item)}
                  title="Phát ngay chiến dịch này không chờ đến giờ hẹn"
                >
                  Phát ngay
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={isBusy}
                  leftIcon={<Ban className="w-3.5 h-3.5 text-amber-600" />}
                  onClick={() => handleCancelScheduled(item)}
                  title="Hủy lịch hẹn giờ"
                >
                  Hủy lịch
                </Button>
              </>
            )}

            {Number(item.failed_count) > 0 && item.status !== 'SENDING' && (
              <Button
                variant="soft"
                size="sm"
                isLoading={isBusy}
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                onClick={() => handleRetryFailed(item)}
                title="Gửi lại các tin nhắn bị lỗi"
              >
                Gửi lại tin lỗi
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(item)}
              title="Xóa chiến dịch"
            >
              <Trash2 className="w-4 h-4 text-rose-500 hover:text-rose-700" />
            </Button>
          </div>
        );
      },
    },
  ];

  // ─── Detail Modal Filtered Recipients ───────────────────────────────────────

  const filteredRecipients = useMemo(() => {
    const list = selectedCampaign?.recipients ?? [];
    return list.filter((r) => {
      if (recipientFilter === 'SENT' && r.status !== 'SENT') return false;
      if (recipientFilter === 'FAILED' && r.status !== 'FAILED') return false;
      if (recipientFilter === 'SKIPPED' && !r.status.startsWith('SKIPPED')) return false;
      if (
        recipientFilter === 'PENDING' &&
        r.status !== 'SCHEDULED' &&
        r.status !== 'QUEUED' &&
        r.status !== 'SENDING'
      ) {
        return false;
      }
      if (recipientSearch.trim()) {
        const q = recipientSearch.toLowerCase().trim();
        const matchTarget = (r.target_display_name || '').toLowerCase().includes(q);
        const matchMsg = (r.rendered_content || '').toLowerCase().includes(q);
        const matchErr = (r.error_message || '').toLowerCase().includes(q);
        if (!matchTarget && !matchMsg && !matchErr) return false;
      }
      return true;
    });
  }, [selectedCampaign?.recipients, recipientFilter, recipientSearch]);

  return (
    <div className="space-y-6">
      {/* ─── 4 KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-2xl border border-border/80 p-4 shadow-soft flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Tổng chiến dịch
            </p>
            <p className="text-2xl font-bold text-text-primary mt-1">
              {kpiStats.totalCampaigns}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Chiến dịch gửi tin Zalo & LINE
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-border/80 p-4 shadow-soft flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Đang hẹn giờ chờ phát
            </p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {kpiStats.scheduledCount}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Tự động kích hoạt đúng lịch hẹn
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-border/80 p-4 shadow-soft flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              Tổng tin đã gửi thành công
            </p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {kpiStats.totalSentMessages.toLocaleString('vi-VN')}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Giãn cách an toàn chống khóa nick
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-border/80 p-4 shadow-soft flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
              Đang phát / Hoàn tất
            </p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">
              {kpiStats.activeOrCompletedCount}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {kpiStats.sendingNowCount > 0
                ? `${kpiStats.sendingNowCount} chiến dịch đang gửi trực tiếp...`
                : 'Tất cả tiến trình ổn định'}
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ─── Filter & Action Bar ─────────────────────────────────────────────── */}
      <div className="bg-surface rounded-2xl border border-border/80 p-4 shadow-soft flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="w-full sm:w-80">
            <Input
              placeholder="Tìm theo tên chiến dịch, nội dung..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4 text-text-muted" />}
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { key: 'ALL', label: 'Tất cả' },
              { key: 'SCHEDULED', label: 'Đang hẹn giờ' },
              { key: 'SENDING', label: 'Đang gửi' },
              { key: 'COMPLETED', label: 'Hoàn thành' },
              { key: 'PARTIAL_FAILED', label: 'Có tin lỗi' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
                  statusFilter === tab.key
                    ? 'bg-primary text-white border-primary shadow-xs'
                    : 'bg-surface-muted/70 text-text-secondary border-border/60 hover:bg-surface-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchCampaigns()}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Làm mới
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={openCreateModal}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Tạo chiến dịch gửi tin / hẹn giờ
          </Button>
        </div>
      </div>

      {/* ─── Campaigns DataTable ─────────────────────────────────────────────── */}
      <DataTable
        data={filteredCampaigns}
        columns={columns}
        isLoading={loading}
        emptyMessage="Chưa có chiến dịch gửi tin đa kênh nào. Bấm 'Tạo chiến dịch gửi tin / hẹn giờ' để bắt đầu."
        onRowClick={(item) => openDetailModal(item)}
      />

      {/* ─── Create Broadcast Campaign Modal ─────────────────────────────────── */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        size="2xl"
        title="Tạo Chiến dịch Gửi tin / Hẹn giờ Đa kênh (Zalo & LINE)"
        description="Phát thông báo đồng loạt hoặc đặt lịch hẹn giờ gửi tự động vào Nhóm chăm sóc học viên / Nhóm Zalo / Nhóm LINE với giãn cách an toàn."
        footer={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary bg-surface px-3 py-2 rounded-xl border border-border">
              <Users className="w-4 h-4 text-primary shrink-0" />
              <span>
                Đã chọn:{' '}
                <strong className="text-primary">{selectedStudentIds.length}</strong> học viên
                {' · '}
                <strong className="text-blue-600">{selectedZaloGroupIds.length}</strong> nhóm Zalo
                {' · '}
                <strong className="text-emerald-600">{selectedLineGroupIds.length}</strong> nhóm LINE
              </span>
            </div>
            <div className="flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateModalOpen(false)}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                type="button"
                isLoading={creating}
                leftIcon={
                  scheduleType === 'IMMEDIATE' ? (
                    <Send className="w-4 h-4" />
                  ) : (
                    <Calendar className="w-4 h-4" />
                  )
                }
                onClick={handleCreateCampaign}
              >
                {scheduleType === 'IMMEDIATE'
                  ? `Xác nhận Phát ngay (${totalSelectedTargets} đích)`
                  : `Lên lịch Hẹn giờ phát (${totalSelectedTargets} đích)`}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleCreateCampaign} className="space-y-6">
          {/* ─── Section 1: Thông tin & Thời gian phát ───────────────────────── */}
          <div className="p-4 sm:p-5 rounded-2xl bg-surface-muted/50 border border-border/80 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h4 className="text-sm font-bold text-text-primary">
                Thông tin chiến dịch & Chế độ thời gian phát
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Tên chiến dịch *"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="VD: Thông báo lịch nghỉ lễ 20/10, Nhắc lịch học tuần mới..."
                required
              />
              <Input
                label="Mô tả / Ghi chú nội bộ (Tùy chọn)"
                value={campaignDescription}
                onChange={(e) => setCampaignDescription(e.target.value)}
                placeholder="VD: Gửi cho toàn bộ học viên khối IELTS đang học..."
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
              {/* Schedule Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  Chế độ thời gian phát *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setScheduleType('IMMEDIATE')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                      scheduleType === 'IMMEDIATE'
                        ? 'border-primary bg-primary-soft/40 ring-2 ring-primary/15'
                        : 'border-border bg-surface hover:bg-surface-muted'
                    }`}
                  >
                    <Send
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        scheduleType === 'IMMEDIATE' ? 'text-primary' : 'text-text-muted'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-bold text-text-primary">
                        Gửi ngay lập tức
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5 leading-snug">
                        Phát ngay sau khi bấm xác nhận (có giãn cách chống khóa nick tự động)
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScheduleType('SCHEDULED')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                      scheduleType === 'SCHEDULED'
                        ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-500/15'
                        : 'border-border bg-surface hover:bg-surface-muted'
                    }`}
                  >
                    <Calendar
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        scheduleType === 'SCHEDULED' ? 'text-amber-600' : 'text-text-muted'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-bold text-text-primary">
                        Đặt lịch hẹn giờ
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5 leading-snug">
                        Chọn ngày & giờ cụ thể để hệ thống tự động phát tin
                      </div>
                    </div>
                  </button>
                </div>

                {scheduleType === 'SCHEDULED' && (
                  <div className="mt-3 p-3 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-600" />
                      Thời điểm phát tin:
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="px-3 py-1.5 text-xs font-semibold bg-white border border-amber-300 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Channel Mode Selector */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  Kênh gửi ưu tiên (Khi gửi theo Học viên) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      value: 'AUTO' as BroadcastChannelMode,
                      title: 'Tự động (Zalo hoặc LINE)',
                      desc: 'Theo kênh chăm sóc đã gắn của Học viên',
                    },
                    {
                      value: 'BOTH' as BroadcastChannelMode,
                      title: 'Đồng thời cả Zalo & LINE',
                      desc: 'Gửi vào cả 2 kênh nếu HV có liên kết',
                    },
                    {
                      value: 'ZALO_ONLY' as BroadcastChannelMode,
                      title: 'Chỉ gửi qua Zalo',
                      desc: 'Chỉ phát qua Nhóm / Nick Zalo',
                    },
                    {
                      value: 'LINE_ONLY' as BroadcastChannelMode,
                      title: 'Chỉ gửi qua LINE',
                      desc: 'Chỉ phát qua Nhóm / OA LINE',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setChannelMode(opt.value)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        channelMode === opt.value
                          ? 'border-primary bg-primary-soft/40 ring-2 ring-primary/15'
                          : 'border-border bg-surface hover:bg-surface-muted'
                      }`}
                    >
                      <div className="text-xs font-bold text-text-primary">{opt.title}</div>
                      <div className="text-[11px] text-text-muted mt-0.5 line-clamp-1">
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Section 2: Chọn Đích nhận tin (Multi-Select Tabs) ───────────── */}
          <div className="p-4 sm:p-5 rounded-2xl bg-surface-muted/50 border border-border/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <div>
                  <h4 className="text-sm font-bold text-text-primary">
                    Chọn Đích nhận tin (Học viên / Nhóm Zalo / Nhóm LINE)
                  </h4>
                  <p className="text-xs text-text-muted">
                    Có thể kết hợp chọn Học viên (gửi vào nhóm chăm sóc riêng) và chọn trực tiếp các Nhóm lớp chung.
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-semibold text-text-secondary shrink-0">
                <span>Đã chọn:</span>
                <span className="text-primary font-bold">{selectedStudentIds.length} học viên</span>
                <span>·</span>
                <span className="text-blue-600 font-bold">{selectedZaloGroupIds.length} nhóm Zalo</span>
                <span>·</span>
                <span className="text-emerald-600 font-bold">{selectedLineGroupIds.length} nhóm LINE</span>
              </div>
            </div>

            {/* Target Mode Tabs */}
            <div className="flex flex-wrap gap-1.5 border-b border-border/80 pb-2">
              <button
                type="button"
                onClick={() => setTargetTab('STUDENTS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  targetTab === 'STUDENTS'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface text-text-secondary border border-border/70 hover:bg-surface-muted'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Theo Học viên ({normalizedStudents.length})</span>
                {selectedStudentIds.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
                    Đã chọn {selectedStudentIds.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setTargetTab('ZALO_GROUPS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  targetTab === 'ZALO_GROUPS'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-surface text-text-secondary border border-border/70 hover:bg-surface-muted'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Nhóm Zalo ({catalog.zaloGroups?.length ?? 0})</span>
                {selectedZaloGroupIds.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
                    Đã chọn {selectedZaloGroupIds.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setTargetTab('LINE_GROUPS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  targetTab === 'LINE_GROUPS'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-surface text-text-secondary border border-border/70 hover:bg-surface-muted'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Nhóm LINE ({catalog.lineGroups?.length ?? 0})</span>
                {selectedLineGroupIds.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
                    Đã chọn {selectedLineGroupIds.length}
                  </span>
                )}
              </button>
            </div>

            {catalogLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-text-muted bg-surface rounded-xl border border-border/60">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>Đang tải danh bạ Học viên & Nhóm Zalo / LINE...</span>
              </div>
            ) : (
              <>
                {/* ─── Tab A: Chọn theo Học viên ─────────────────────────────── */}
                {targetTab === 'STUDENTS' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      <Input
                        placeholder="Tìm tên HV, mã HV, SĐT, nhóm..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        leftIcon={<Search className="w-3.5 h-3.5 text-text-muted" />}
                      />

                      <select
                        value={studentCsFilter}
                        onChange={(e) => setStudentCsFilter(e.target.value)}
                        className="h-10 px-3 rounded-xl border border-border bg-surface text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="ALL">Tất cả CSKH phụ trách</option>
                        {csOptions.map((cs) => (
                          <option key={cs} value={cs}>
                            CSKH: {cs}
                          </option>
                        ))}
                      </select>

                      <select
                        value={studentClassFilter}
                        onChange={(e) => setStudentClassFilter(e.target.value)}
                        className="h-10 px-3 rounded-xl border border-border bg-surface text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="ALL">Tất cả Lớp học</option>
                        {classOptions.map((cls) => (
                          <option key={cls} value={cls}>
                            Lớp: {cls}
                          </option>
                        ))}
                      </select>

                      <select
                        value={studentLinkFilter}
                        onChange={(e) => setStudentLinkFilter(e.target.value as any)}
                        className="h-10 px-3 rounded-xl border border-border bg-surface text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="ALL">Tất cả trạng thái liên kết</option>
                        <option value="LINKED_ANY">Đã liên kết (Zalo hoặc LINE)</option>
                        <option value="ZALO">Đã gắn Nhóm/Nick Zalo</option>
                        <option value="LINE">Đã gắn Nhóm/Nick LINE</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-text-muted">
                        Hiển thị <strong>{filteredStudents.length}</strong> học viên phù hợp bộ lọc
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="soft"
                          size="sm"
                          onClick={selectAllLinkedStudents}
                          leftIcon={<CheckSquare className="w-3.5 h-3.5" />}
                        >
                          Chọn tất cả học viên đã liên kết
                        </Button>
                        {selectedStudentIds.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearStudentsSelection}
                          >
                            Bỏ chọn ({selectedStudentIds.length})
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-surface divide-y divide-border/60">
                      {filteredStudents.length === 0 ? (
                        <div className="py-8 text-center text-xs text-text-muted">
                          Không tìm thấy học viên nào phù hợp bộ lọc.
                        </div>
                      ) : (
                        filteredStudents.map((st) => {
                          const checked = selectedStudentIds.includes(st.id);
                          return (
                            <label
                              key={st.id}
                              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                                checked ? 'bg-primary-soft/30' : 'hover:bg-surface-muted/60'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleStudent(st.id)}
                                  className="w-4 h-4 rounded text-primary focus:ring-primary/30"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-text-primary">
                                      {st.fullName}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold">
                                      Mã HV: {st.externalId}
                                    </span>
                                    {st.className !== 'Chưa xếp lớp' && (
                                      <span className="text-[11px] text-indigo-600 font-medium">
                                        • {st.className}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span>CSKH: {st.csDisplay}</span>
                                    {st.phone && <span>• SĐT: {st.phone}</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    st.zaloLinked
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-slate-100 text-slate-400 border-slate-200'
                                  }`}
                                  title={st.zaloTargetLabel}
                                >
                                  Zalo: {st.zaloLinked ? 'Đã gắn nhóm' : 'Chưa gắn'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    st.lineLinked
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-slate-100 text-slate-400 border-slate-200'
                                  }`}
                                  title={st.lineTargetLabel}
                                >
                                  LINE: {st.lineLinked ? 'Đã gắn nhóm' : 'Chưa gắn'}
                                </span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* ─── Tab B: Chọn trực tiếp Nhóm Zalo ───────────────────────── */}
                {targetTab === 'ZALO_GROUPS' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                        <div className="w-full sm:w-80">
                          <Input
                            placeholder="Tìm tên nhóm Zalo, mã nhóm..."
                            value={zaloGroupSearch}
                            onChange={(e) => setZaloGroupSearch(e.target.value)}
                            leftIcon={<Search className="w-3.5 h-3.5 text-text-muted" />}
                          />
                        </div>
                        <select
                          value={zaloAccountFilter}
                          onChange={(e) => setZaloAccountFilter(e.target.value)}
                          className="h-10 px-3 rounded-xl border border-border bg-surface text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="ALL">Tất cả tài khoản Zalo</option>
                          {(catalog.zaloAccounts ?? []).map((acc) => (
                            <option key={acc.id} value={String(acc.id)}>
                              Nick Zalo: {acc.display_name || `#${acc.id}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Button
                        type="button"
                        variant="soft"
                        size="sm"
                        onClick={selectAllFilteredZaloGroups}
                        leftIcon={<CheckSquare className="w-3.5 h-3.5" />}
                      >
                        Chọn tất cả nhóm Zalo ({filteredZaloGroups.length})
                      </Button>
                    </div>

                    <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-surface divide-y divide-border/60">
                      {filteredZaloGroups.length === 0 ? (
                        <div className="py-8 text-center text-xs text-text-muted">
                          Chưa có nhóm Zalo nào đồng bộ hoặc phù hợp từ khóa.
                        </div>
                      ) : (
                        filteredZaloGroups.map((g: BroadcastTargetZaloGroupItem) => {
                          const checked = selectedZaloGroupIds.includes(g.id);
                          const ownerName =
                            g.zalo_account?.display_name ||
                            g.account_name ||
                            zaloAccMap.get(g.zalo_account_id) ||
                            `Zalo #${g.zalo_account_id}`;
                          return (
                            <label
                              key={g.id}
                              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                                checked ? 'bg-blue-50/60' : 'hover:bg-surface-muted/60'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleZaloGroup(g.id)}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500/30"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-text-primary truncate">
                                    {g.name || `Nhóm Zalo #${g.zalo_group_id}`}
                                  </div>
                                  <div className="text-[11px] text-text-muted flex items-center gap-2">
                                    <span>Nick quản lý: {ownerName}</span>
                                    <span>• {g.member_count ?? 0} thành viên</span>
                                  </div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                Nhóm Zalo
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* ─── Tab C: Chọn trực tiếp Nhóm LINE ───────────────────────── */}
                {targetTab === 'LINE_GROUPS' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                        <div className="w-full sm:w-80">
                          <Input
                            placeholder="Tìm tên nhóm LINE, mã nhóm..."
                            value={lineGroupSearch}
                            onChange={(e) => setLineGroupSearch(e.target.value)}
                            leftIcon={<Search className="w-3.5 h-3.5 text-text-muted" />}
                          />
                        </div>
                        <select
                          value={lineAccountFilter}
                          onChange={(e) => setLineAccountFilter(e.target.value)}
                          className="h-10 px-3 rounded-xl border border-border bg-surface text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="ALL">Tất cả tài khoản LINE</option>
                          {(catalog.lineAccounts ?? []).map((acc) => (
                            <option key={acc.id} value={String(acc.id)}>
                              LINE: {acc.display_name || `#${acc.id}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Button
                        type="button"
                        variant="soft"
                        size="sm"
                        onClick={selectAllFilteredLineGroups}
                        leftIcon={<CheckSquare className="w-3.5 h-3.5" />}
                      >
                        Chọn tất cả nhóm LINE ({filteredLineGroups.length})
                      </Button>
                    </div>

                    <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-surface divide-y divide-border/60">
                      {filteredLineGroups.length === 0 ? (
                        <div className="py-8 text-center text-xs text-text-muted">
                          Chưa có nhóm LINE nào đồng bộ hoặc phù hợp từ khóa.
                        </div>
                      ) : (
                        filteredLineGroups.map((g: BroadcastTargetLineGroupItem) => {
                          const checked = selectedLineGroupIds.includes(g.id);
                          const ownerName =
                            g.line_account?.display_name ||
                            g.account_name ||
                            lineAccMap.get(g.line_account_id) ||
                            `LINE #${g.line_account_id}`;
                          return (
                            <label
                              key={g.id}
                              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                                checked ? 'bg-emerald-50/60' : 'hover:bg-surface-muted/60'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleLineGroup(g.id)}
                                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500/30"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-text-primary truncate">
                                    {g.name || `Nhóm LINE #${g.line_group_id}`}
                                  </div>
                                  <div className="text-[11px] text-text-muted flex items-center gap-2">
                                    <span>Tài khoản LINE: {ownerName}</span>
                                    <span>• {g.member_count ?? 0} thành viên</span>
                                  </div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                Nhóm LINE
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ─── Section 3: Soạn nội dung tin nhắn Rich Chat (Zalo PC & LINE Flex) ─── */}
          <div className="p-4 sm:p-5 rounded-2xl bg-surface-muted/50 border border-border/80 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                3
              </span>
              <div>
                <h4 className="text-sm font-bold text-text-primary">
                  Khung Soạn Thảo Tin Nhắn Đa Phương Tiện (Chuẩn Zalo PC & LINE OA Flex)
                </h4>
                <p className="text-xs text-text-muted">
                  Hỗ trợ in đậm, in nghiêng, gạch chân, tô màu chữ, đánh dấu Khẩn cấp (!!), đính kèm Hình ảnh / File tài liệu và gắn Thẻ Link / Nút bấm CTA.
                </p>
              </div>
            </div>

            <RichChatComposer
              value={messageContent}
              onChange={setMessageContent}
              metadata={messageMetadata}
              onMetadataChange={setMessageMetadata}
              sampleStudent={previewSampleStudent}
            />
          </div>
        </form>
      </Modal>

      {/* ─── Broadcast Detail Modal ──────────────────────────────────────────── */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        size="2xl"
        title={
          selectedCampaign
            ? `Chi tiết Chiến dịch: ${selectedCampaign.name}`
            : 'Chi tiết Chiến dịch Gửi tin'
        }
        description={
          selectedCampaign
            ? `Chế độ: ${
                BROADCAST_CHANNEL_MODE_LABELS[selectedCampaign.channel_mode] ||
                selectedCampaign.channel_mode
              } · ${
                selectedCampaign.schedule_type === 'SCHEDULED'
                  ? `Hẹn giờ: ${formatDateTimeVN(selectedCampaign.scheduled_at)}`
                  : `Tạo lúc: ${formatDateTimeVN(selectedCampaign.created_at)}`
              }`
            : undefined
        }
        footer={
          selectedCampaign ? (
            <div className="flex items-center justify-between w-full gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {selectedCampaign.status === 'SCHEDULED' && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<Send className="w-3.5 h-3.5" />}
                      onClick={() => handleSendNow(selectedCampaign)}
                      isLoading={actionLoadingId === selectedCampaign.id}
                    >
                      Phát ngay bây giờ
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Ban className="w-3.5 h-3.5 text-amber-600" />}
                      onClick={() => handleCancelScheduled(selectedCampaign)}
                      isLoading={actionLoadingId === selectedCampaign.id}
                    >
                      Hủy lịch hẹn
                    </Button>
                  </>
                )}
                {Number(selectedCampaign.failed_count) > 0 &&
                  selectedCampaign.status !== 'SENDING' && (
                    <Button
                      variant="soft"
                      size="sm"
                      leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      onClick={() => handleRetryFailed(selectedCampaign)}
                      isLoading={actionLoadingId === selectedCampaign.id}
                    >
                      Gửi lại {selectedCampaign.failed_count} tin lỗi
                    </Button>
                  )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setDetailModalOpen(false)}>
                Đóng
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailLoading || !selectedCampaign ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-sm text-text-muted">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span>Đang tải danh sách đích nhận và trạng thái gửi...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-surface-muted border border-border/70">
                <div className="text-[11px] text-text-muted font-semibold uppercase">
                  Tổng đích nhận
                </div>
                <div className="text-lg font-bold text-text-primary mt-0.5">
                  {selectedCampaign.total_recipients}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/80">
                <div className="text-[11px] text-emerald-700 font-semibold uppercase">
                  Đã gửi thành công
                </div>
                <div className="text-lg font-bold text-emerald-700 mt-0.5">
                  {selectedCampaign.sent_count}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/80">
                <div className="text-[11px] text-rose-700 font-semibold uppercase">
                  Gửi thất bại
                </div>
                <div className="text-lg font-bold text-rose-600 mt-0.5">
                  {selectedCampaign.failed_count}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80">
                <div className="text-[11px] text-amber-700 font-semibold uppercase">
                  Bỏ qua (Chưa gắn kênh)
                </div>
                <div className="text-lg font-bold text-amber-700 mt-0.5">
                  {selectedCampaign.skipped_count}
                </div>
              </div>
            </div>

            {/* Rich Metadata Summary Card (Urgency, Attachments, Links) */}
            {(Boolean(selectedCampaign.message_metadata?.urgency) ||
              (selectedCampaign.message_metadata?.attachments?.length ?? 0) > 0 ||
              (selectedCampaign.message_metadata?.links?.length ?? 0) > 0) && (
              <div className="p-3.5 rounded-xl bg-surface-muted/70 border border-border space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-text-secondary">
                    Định dạng & Đính kèm của chiến dịch:
                  </span>
                  {selectedCampaign.message_metadata?.urgency === 2 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-50 text-[#db342e] border border-rose-200">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>!! Khẩn cấp</span>
                    </span>
                  )}
                  {selectedCampaign.message_metadata?.urgency === 1 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-[#f27806] border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>! Quan trọng</span>
                    </span>
                  )}
                  {(selectedCampaign.message_metadata?.attachments?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      <Paperclip className="w-3 h-3" />
                      <span>
                        📎 {selectedCampaign.message_metadata?.attachments?.length} tệp đính kèm
                      </span>
                    </span>
                  )}
                  {(selectedCampaign.message_metadata?.links?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Link2 className="w-3 h-3" />
                      <span>
                        🔗 {selectedCampaign.message_metadata?.links?.length} link / nút bấm
                      </span>
                    </span>
                  )}
                </div>

                {(selectedCampaign.message_metadata?.attachments?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedCampaign.message_metadata?.attachments?.map((att, idx) => (
                      <a
                        key={idx}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-primary text-xs text-text-primary transition-colors"
                      >
                        {isImageAttachment(att) ? (
                          <img
                            src={att.url}
                            alt={att.filename}
                            className="w-6 h-6 rounded object-cover"
                          />
                        ) : (
                          <FileText className="w-4 h-4 text-primary" />
                        )}
                        <span className="font-semibold truncate max-w-[180px]">
                          {att.filename}
                        </span>
                        {att.size > 0 && (
                          <span className="text-[10px] text-text-muted">
                            ({formatBytes(att.size)})
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}

                {(selectedCampaign.message_metadata?.links?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedCampaign.message_metadata?.links?.map((lnk, idx) => (
                      <a
                        key={idx}
                        href={lnk.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/70 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{lnk.title || lnk.url}</span>
                        {lnk.buttonLabel && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">
                            {lnk.buttonLabel}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Filter bar for recipients */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { key: 'ALL', label: `Tất cả (${selectedCampaign.recipients?.length ?? 0})` },
                  { key: 'SENT', label: 'Đã gửi' },
                  { key: 'PENDING', label: 'Đang chờ / Đang gửi' },
                  { key: 'FAILED', label: 'Lỗi' },
                  { key: 'SKIPPED', label: 'Bỏ qua' },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setRecipientFilter(f.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                      recipientFilter === f.key
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-text-secondary border-border hover:bg-surface-muted'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="w-full sm:w-64">
                <Input
                  placeholder="Tìm người nhận, nội dung..."
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5 text-text-muted" />}
                />
              </div>
            </div>

            {/* Recipients list */}
            <div className="max-h-[380px] overflow-y-auto rounded-xl border border-border divide-y divide-border/60 bg-surface">
              {filteredRecipients.length === 0 ? (
                <div className="py-10 text-center text-xs text-text-muted">
                  Không có bản ghi người nhận nào trong bộ lọc này.
                </div>
              ) : (
                filteredRecipients.map((r) => {
                  const stInfo = DELIVERY_STATUS_LABELS[r.status] || {
                    label: r.status,
                    variant: 'neutral',
                  };
                  const isLine = r.platform === 'LINE';
                  return (
                    <div key={r.id} className="p-3.5 space-y-1.5 hover:bg-surface-muted/40">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isLine
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {r.platform}
                          </span>
                          <span className="text-xs font-bold text-text-primary">
                            {r.target_display_name ||
                              r.external_target_id ||
                              `Đích nhận #${r.id}`}
                          </span>
                          <span className="text-[11px] text-text-muted">
                            ({r.target_type})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {r.sent_at && (
                            <span className="text-[11px] text-text-muted">
                              Gửi lúc: {formatDateTimeVN(r.sent_at)}
                            </span>
                          )}
                          <Badge
                            size="sm"
                            variant={
                              (stInfo.variant as any) ||
                              (r.status === 'SENT'
                                ? 'success'
                                : r.status === 'FAILED'
                                ? 'danger'
                                : 'neutral')
                            }
                          >
                            {stInfo.label}
                          </Badge>
                        </div>
                      </div>

                      <div className="text-xs text-text-primary bg-surface-muted/70 rounded-lg px-3 py-2 whitespace-pre-wrap border border-border/50 space-y-1.5">
                        <div>{renderFormattedRichText(r.rendered_content)}</div>
                        {(() => {
                          const rMeta =
                            r.rendered_metadata ?? selectedCampaign.message_metadata;
                          const rUrgency = rMeta?.urgency ?? 0;
                          const rAtts = rMeta?.attachments?.length ?? 0;
                          const rLinks = rMeta?.links?.length ?? 0;
                          if (!rUrgency && !rAtts && !rLinks) return null;
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/40">
                              {rUrgency === 2 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-[#db342e] border border-rose-200">
                                  !! Khẩn cấp
                                </span>
                              )}
                              {rUrgency === 1 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-[#f27806] border border-amber-200">
                                  ! Quan trọng
                                </span>
                              )}
                              {rAtts > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  📎 {rAtts} tệp
                                </span>
                              )}
                              {rLinks > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  🔗 {rLinks} link
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {r.error_message && (
                        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200/70 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Lý do lỗi / bỏ qua: {r.error_message}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Delete Confirm Modal ────────────────────────────────────────────── */}
      {deleteTarget && (
        <Modal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          size="sm"
          title="Xóa chiến dịch gửi tin?"
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Hủy
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                isLoading={deleting}
              >
                Xóa chiến dịch
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-secondary leading-relaxed">
            Bạn có chắc chắn muốn xóa chiến dịch{' '}
            <strong className="text-text-primary">{deleteTarget.name}</strong>? Toàn bộ lịch sử
            gửi tin của chiến dịch này sẽ bị xóa.
          </p>
        </Modal>
      )}
    </div>
  );
};
