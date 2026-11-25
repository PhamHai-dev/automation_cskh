import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { FilterBar, ActiveFilterChip } from '../../../components/common/FilterBar';
import { AdvancedFilterDrawer } from '../../../components/common/AdvancedFilterDrawer';
import { useAuth } from '../../../contexts/AuthContext';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { CareTaskList } from '../components/CareTaskList';
import { CareTaskModal } from '../components/CareTaskModal';
import { CareLogTimeline } from '../components/CareLogTimeline';
import { EnrollmentSearchSelect } from '../components/EnrollmentSearchSelect';
import { careApi } from '../api/care.api';
import {
  CareTask,
  CareLog,
  TaskFilterParams,
  TaskPriority,
  TaskType,
  CreateCareTaskDTO,
  UpdateCareTaskDTO,
  CreateCareLogDTO,
  AttendanceNotificationItem,
} from '../types/care.types';
import {
  Plus,
  ListTodo,
  History,
  AlertTriangle,
  Bell,
  CheckCheck,
  Check,
  ArrowRight,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from 'lucide-react';

type CareTab = 'tasks' | 'logs' | 'notifications';

const ATTENDANCE_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  ATTENDED: {
    label: '1 · Có mặt',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold',
  },
  ABSENT_APPROVED_A: {
    label: 'Nghỉ có phép (A)',
    className: 'bg-amber-100 text-amber-800 border-amber-300 font-extrabold',
  },
  LEAVE_B: {
    label: 'Bảo lưu (B)',
    className: 'bg-blue-100 text-blue-800 border-blue-300 font-extrabold',
  },
  ABSENT_UNAPPROVED_C: {
    label: 'Nghỉ sai QĐ (C)',
    className: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold',
  },
  TEACHER_ABSENT_D: {
    label: 'GV nghỉ (D)',
    className: 'bg-red-200 text-red-900 border-red-400 font-extrabold',
  },
  TECH_ERROR_E: {
    label: 'Lỗi kỹ thuật (E)',
    className: 'bg-slate-200 text-text-primary border-slate-400 font-extrabold',
  },
};

const renderAttendanceStatusBadge = (status: string | null) => {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border border-border bg-surface-muted text-text-secondary">
        Chưa điểm danh
      </span>
    );
  }
  const cfg = ATTENDANCE_STATUS_BADGE[status] || {
    label: status,
    className: 'bg-surface-muted text-text-secondary border-border-strong font-bold',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
};

export const CarePage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isTeacherOnly = Boolean(
    user?.roles.includes('TEACHER') &&
      !user?.roles.includes('ADMIN') &&
      !user?.roles.includes('MANAGE') &&
      !user?.roles.includes('CS')
  );

  const initialUrlTab = searchParams.get('tab');
  const initialUrlEnrollmentId = Number(searchParams.get('enrollment_id')) || null;

  const [activeTab, setActiveTab] = useState<CareTab>(() => {
    if (isTeacherOnly) return 'notifications';
    if (initialUrlTab === 'logs' || initialUrlTab === 'notifications' || initialUrlTab === 'tasks') {
      return initialUrlTab;
    }
    return 'tasks';
  });

  useEffect(() => {
    if (isTeacherOnly && activeTab !== 'notifications') {
      setActiveTab('notifications');
    }
  }, [isTeacherOnly, activeTab]);

  // Task State
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskSearch, setTaskSearch] = useState('');
  const debouncedTaskSearch = useDebouncedValue(taskSearch.trim(), 300);
  const [taskProgram, setTaskProgram] = useState<'ALL' | 'KAIWA' | 'JLPT'>('ALL');
  const [taskFilter, setTaskFilter] = useState<TaskFilterParams>({ status: 'PENDING' });
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(25);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskTotalPages, setTaskTotalPages] = useState(1);
  const [showTaskAdvancedFilters, setShowTaskAdvancedFilters] = useState(false);
  const [taskAdvancedDraft, setTaskAdvancedDraft] = useState<TaskFilterParams>({});
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CareTask | null>(null);

  // Cancel Task Confirmation Modal State
  const [cancellingTaskId, setCancellingTaskId] = useState<number | null>(null);

  // Log State
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(
    !isTeacherOnly ? initialUrlEnrollmentId : null
  );
  const [pendingEnrollmentId, setPendingEnrollmentId] = useState<number | null>(
    !isTeacherOnly ? initialUrlEnrollmentId : null
  );
  const [logs, setLogs] = useState<CareLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState<AttendanceNotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState<boolean>(false);
  const [notifPage, setNotifPage] = useState<number>(1);
  const [notifPageSize, setNotifPageSize] = useState<number>(25);

  // Fetch notifications
  const loadNotifications = useCallback(
    async (statusFilter: 'all' | 'unread' | 'read' = notificationFilter) => {
      try {
        setNotificationsLoading(true);
        const result = await careApi.listNotifications({
          status: statusFilter,
          limit: 100,
        });
        setNotifications(result.items);
        setUnreadCount(result.unreadCount);
      } catch (err: any) {
        console.error('Failed to load care notifications', err);
      } finally {
        setNotificationsLoading(false);
      }
    },
    [notificationFilter]
  );

  useEffect(() => {
    loadNotifications(notificationFilter);
  }, [notificationFilter, loadNotifications]);

  useEffect(() => {
    if (activeTab === 'notifications') {
      loadNotifications(notificationFilter);
    }
  }, [activeTab]);

  // Fetch tasks
  const loadTasks = async () => {
    if (isTeacherOnly) return;
    try {
      setTasksLoading(true);
      const result = await careApi.listTasks({
        ...taskFilter,
        search: debouncedTaskSearch || undefined,
        program_type: taskProgram === 'ALL' ? undefined : taskProgram,
        page: taskPage,
        pageSize: taskPageSize,
      });
      setTasks(result.items);
      setTaskTotal(result.total);
      setTaskTotalPages(result.totalPages);
      if (taskPage > result.totalPages) setTaskPage(result.totalPages);
    } catch (err: any) {
      console.error('Failed to load tasks', err);
      toast.error('Không thể tải danh sách nhiệm vụ chăm sóc');
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'tasks' && !isTeacherOnly) {
      loadTasks();
    }
  }, [taskFilter, debouncedTaskSearch, taskProgram, taskPage, taskPageSize, activeTab, isTeacherOnly]);

  // Fetch logs
  const loadLogs = async (enrollmentId: number) => {
    try {
      setLogsLoading(true);
      const data = await careApi.getLogs(enrollmentId);
      setLogs(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể tải nhật ký chăm sóc của mã ghi danh này');
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleSearchEnrollmentLogs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEnrollmentId) {
      toast.warning('Vui lòng chọn học viên / ghi danh cần tra cứu');
      return;
    }
    setSelectedEnrollmentId(pendingEnrollmentId);
    loadLogs(pendingEnrollmentId);
  };

  useEffect(() => {
    if (!isTeacherOnly && initialUrlEnrollmentId) {
      loadLogs(initialUrlEnrollmentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacherOnly, initialUrlEnrollmentId]);

  // Notification Actions
  const handleMarkAsRead = async (id: number) => {
    try {
      setMarkingId(id);
      await careApi.markNotificationRead(id);
      const nowIso = new Date().toISOString();
      setNotifications((prev) => {
        if (notificationFilter === 'unread') {
          return prev.filter((item) => item.id !== id);
        }
        return prev.map((item) =>
          item.id === id ? { ...item, is_read: true, read_at: nowIso } : item
        );
      });
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể đánh dấu đã xem');
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;
    try {
      setMarkingAll(true);
      await careApi.markAllNotificationsRead();
      const nowIso = new Date().toISOString();
      setNotifications((prev) => {
        if (notificationFilter === 'unread') {
          return [];
        }
        return prev.map((item) => ({
          ...item,
          is_read: true,
          read_at: item.read_at || nowIso,
        }));
      });
      setUnreadCount(0);
      toast.success('Đã đánh dấu tất cả thông báo là đã đọc');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể đánh dấu tất cả đã đọc');
    } finally {
      setMarkingAll(false);
    }
  };

  // Task Actions
  const handleCompleteTask = async (taskId: number) => {
    try {
      await careApi.completeTask(taskId);
      toast.success('Đã đánh dấu hoàn thành nhiệm vụ!');
      loadTasks();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Lỗi khi hoàn thành nhiệm vụ');
    }
  };

  const handleConfirmCancelTask = async () => {
    if (!cancellingTaskId) return;
    try {
      await careApi.cancelTask(cancellingTaskId);
      toast.success('Đã hủy nhiệm vụ thành công.');
      setCancellingTaskId(null);
      loadTasks();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Lỗi khi hủy nhiệm vụ');
    }
  };

  const handleTaskSubmit = async (data: CreateCareTaskDTO | UpdateCareTaskDTO) => {
    try {
      if (editingTask) {
        await careApi.updateTask(editingTask.id, data as UpdateCareTaskDTO);
        toast.success('Cập nhật nhiệm vụ thành công!');
      } else {
        await careApi.createTask(data as CreateCareTaskDTO);
        toast.success('Tạo nhiệm vụ chăm sóc mới thành công!');
      }
      loadTasks();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Lỗi khi lưu nhiệm vụ');
    }
  };

  // Log Actions
  const handleAddLog = async (data: CreateCareLogDTO) => {
    if (!selectedEnrollmentId) return;
    try {
      await careApi.createLog(selectedEnrollmentId, data);
      toast.success('Đã ghi nhận nhật ký chăm sóc mới!');
      loadLogs(selectedEnrollmentId);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Lỗi khi lưu nhật ký chăm sóc');
    }
  };

  const taskAdvancedCount = (value: TaskFilterParams) =>
    (value.priority ? 1 : 0) +
    (value.type ? 1 : 0) +
    (value.due_from || value.due_to ? 1 : 0) +
    (value.created_from || value.created_to ? 1 : 0) +
    (value.assigned_to_id ? 1 : 0) +
    (value.enrollment_id ? 1 : 0);
  const appliedTaskAdvancedCount = taskAdvancedCount(taskFilter);
  const draftTaskAdvancedCount = taskAdvancedCount(taskAdvancedDraft);
  const taskActiveCount =
    (taskSearch.trim() ? 1 : 0) +
    (taskProgram !== 'ALL' ? 1 : 0) +
    (taskFilter.status ? 1 : 0) +
    (taskFilter.due_filter ? 1 : 0) +
    appliedTaskAdvancedCount;
  const resetTaskPage = () => setTaskPage(1);
  const updateTaskQuickFilter = (patch: Partial<TaskFilterParams>) => {
    resetTaskPage();
    setTaskFilter((current) => ({ ...current, ...patch }));
  };
  const openTaskAdvancedFilters = () => {
    setTaskAdvancedDraft({
      priority: taskFilter.priority,
      type: taskFilter.type,
      due_from: taskFilter.due_from,
      due_to: taskFilter.due_to,
      created_from: taskFilter.created_from,
      created_to: taskFilter.created_to,
      assigned_to_id: taskFilter.assigned_to_id,
      enrollment_id: taskFilter.enrollment_id,
    });
    setShowTaskAdvancedFilters(true);
  };
  const applyTaskAdvancedFilters = () => {
    resetTaskPage();
    setTaskFilter((current) => ({
      status: current.status,
      due_filter: current.due_filter,
      ...taskAdvancedDraft,
    }));
    setShowTaskAdvancedFilters(false);
  };
  const clearTaskAdvancedDraft = () => setTaskAdvancedDraft({});
  const clearAllTaskFilters = () => {
    setTaskSearch('');
    setTaskProgram('ALL');
    setTaskFilter({});
    resetTaskPage();
  };
  const taskFilterChips: ActiveFilterChip[] = [
    ...(taskSearch.trim()
      ? [{ id: 'task-search', label: 'Tìm', value: taskSearch.trim(), onRemove: () => { setTaskSearch(''); resetTaskPage(); } }]
      : []),
    ...(taskProgram !== 'ALL'
      ? [{ id: 'task-program', label: 'Ngữ cảnh', value: taskProgram, tone: taskProgram === 'KAIWA' ? 'kaiwa' as const : 'jlpt' as const, onRemove: () => { setTaskProgram('ALL'); resetTaskPage(); } }]
      : []),
    ...(taskFilter.status
      ? [{ id: 'task-status', label: 'Trạng thái', value: taskFilter.status, onRemove: () => updateTaskQuickFilter({ status: undefined }) }]
      : []),
    ...(taskFilter.due_filter
      ? [{ id: 'task-due', label: 'Thời hạn', value: taskFilter.due_filter, tone: 'warning' as const, onRemove: () => updateTaskQuickFilter({ due_filter: undefined }) }]
      : []),
    ...(taskFilter.priority
      ? [{ id: 'task-priority', label: 'Ưu tiên', value: taskFilter.priority, onRemove: () => updateTaskQuickFilter({ priority: undefined }) }]
      : []),
    ...(taskFilter.type
      ? [{ id: 'task-type', label: 'Loại việc', value: taskFilter.type, onRemove: () => updateTaskQuickFilter({ type: undefined }) }]
      : []),
    ...(taskFilter.due_from || taskFilter.due_to
      ? [{ id: 'task-due-range', label: 'Khoảng hạn', value: `${taskFilter.due_from || '…'} → ${taskFilter.due_to || '…'}`, onRemove: () => updateTaskQuickFilter({ due_from: undefined, due_to: undefined }) }]
      : []),
    ...(taskFilter.created_from || taskFilter.created_to
      ? [{ id: 'task-created-range', label: 'Ngày tạo', value: `${taskFilter.created_from || '…'} → ${taskFilter.created_to || '…'}`, onRemove: () => updateTaskQuickFilter({ created_from: undefined, created_to: undefined }) }]
      : []),
    ...(taskFilter.assigned_to_id
      ? [{ id: 'task-assignee', label: 'Phụ trách', value: `#${taskFilter.assigned_to_id}`, onRemove: () => updateTaskQuickFilter({ assigned_to_id: undefined }) }]
      : []),
    ...(taskFilter.enrollment_id
      ? [{ id: 'task-enrollment', label: 'Ghi danh', value: `#${taskFilter.enrollment_id}`, onRemove: () => updateTaskQuickFilter({ enrollment_id: undefined }) }]
      : []),
  ];

  const tabItems = isTeacherOnly
    ? [
        {
          value: 'notifications' as const,
          label: 'Thông báo',
          icon: <Bell />,
          badge: unreadCount > 0 ? unreadCount : undefined,
        },
      ]
    : [
        { value: 'tasks' as const, label: 'Nhiệm vụ chăm sóc', icon: <ListTodo /> },
        { value: 'logs' as const, label: 'Nhật ký chăm sóc', icon: <History /> },
        {
          value: 'notifications' as const,
          label: 'Thông báo',
          icon: <Bell />,
          badge: unreadCount > 0 ? unreadCount : undefined,
        },
      ];

  return (
    <PageContainer>
      <PageHeader
        title={isTeacherOnly ? 'Thông báo' : 'Quản lý Chăm sóc Học viên & Nhiệm vụ CS'}
        actions={
          activeTab === 'tasks' && !isTeacherOnly ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Tạo nhiệm vụ mới
            </Button>
          ) : undefined
        }
      />

      {!isTeacherOnly && (
        <HorizontalTabs
          ariaLabel="Nội dung chăm sóc học viên"
          value={activeTab}
          onChange={setActiveTab}
          className="mb-6"
          items={tabItems}
        />
      )}

      {/* Content */}
      {activeTab === 'tasks' && !isTeacherOnly ? (
        <div className="space-y-3">
          <FilterBar
            variant="toolbar"
            title="Tìm kiếm & lọc nhiệm vụ chăm sóc"
            activeCount={taskActiveCount}
            chips={taskFilterChips}
            resultSummary={`${taskTotal.toLocaleString('vi-VN')} nhiệm vụ`}
            onClear={clearAllTaskFilters}
          >
            <div className="relative min-w-[220px] flex-[1_1_320px] xl:max-w-[460px]">
              <input
                id="care-task-search"
                type="search"
                value={taskSearch}
                onChange={(event) => {
                  setTaskSearch(event.target.value);
                  resetTaskPage();
                }}
                placeholder="Học viên, SĐT, lớp, tiêu đề, ghi chú..."
                aria-label="Tìm nhiệm vụ chăm sóc"
                className="h-9 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-xs font-semibold text-text-primary shadow-xs outline-none transition focus:ring-2 focus:ring-primary"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            </div>

            <select
              id="care-task-program-filter"
              value={taskProgram}
              onChange={(event) => {
                setTaskProgram(event.target.value as 'ALL' | 'KAIWA' | 'JLPT');
                resetTaskPage();
              }}
              aria-label="Lọc nhiệm vụ theo ngữ cảnh chương trình"
              className="h-9 min-w-[140px] shrink-0 cursor-pointer rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs outline-none transition focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">Tất cả chương trình</option>
              <option value="KAIWA">Kaiwa</option>
              <option value="JLPT">JLPT</option>
            </select>

            <select
              id="care-task-status-filter"
              value={taskFilter.status || ''}
              onChange={(event) => updateTaskQuickFilter({ status: event.target.value ? event.target.value as any : undefined })}
              aria-label="Lọc nhiệm vụ theo trạng thái"
              className="h-9 min-w-[132px] shrink-0 cursor-pointer rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs outline-none transition focus:ring-2 focus:ring-primary"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Đang chờ</option>
              <option value="DONE">Đã xong</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>

            <select
              id="care-task-due-filter"
              value={taskFilter.due_filter || ''}
              onChange={(event) => updateTaskQuickFilter({ due_filter: event.target.value ? event.target.value as any : undefined })}
              aria-label="Lọc nhiệm vụ theo thời hạn"
              className="h-9 min-w-[140px] shrink-0 cursor-pointer rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs outline-none transition focus:ring-2 focus:ring-primary"
            >
              <option value="">Tất cả thời hạn</option>
              <option value="overdue">Quá hạn</option>
              <option value="today">Hạn hôm nay</option>
              <option value="this_week">7 ngày tới</option>
            </select>

            <Button
              type="button"
              variant={showTaskAdvancedFilters ? 'primary' : 'outline'}
              size="sm"
              onClick={openTaskAdvancedFilters}
              className="h-9 shrink-0 gap-1.5 px-3 text-xs font-bold"
              leftIcon={<SlidersHorizontal className="h-4 w-4" />}
            >
              Bộ lọc
              {appliedTaskAdvancedCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-amber-950">
                  {appliedTaskAdvancedCount}
                </span>
              )}
            </Button>
          </FilterBar>

          <AdvancedFilterDrawer
            open={showTaskAdvancedFilters}
            onClose={() => setShowTaskAdvancedFilters(false)}
            onApply={applyTaskAdvancedFilters}
            onReset={clearTaskAdvancedDraft}
            activeCount={draftTaskAdvancedCount}
            applyLabel={`Áp dụng${draftTaskAdvancedCount ? ` • ${draftTaskAdvancedCount} điều kiện` : ''}`}
            title="Bộ lọc nhiệm vụ nâng cao"
            description="Lọc theo loại việc, độ ưu tiên, thời gian, người phụ trách hoặc mã ghi danh."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="care-task-type-advanced" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-secondary">Loại nhiệm vụ</label>
                <select id="care-task-type-advanced" value={taskAdvancedDraft.type || ''} onChange={(event) => setTaskAdvancedDraft((current) => ({ ...current, type: event.target.value ? event.target.value as TaskType : undefined }))} className="h-9 w-full rounded-xl border border-border bg-white px-3 text-sm shadow-xs outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Tất cả loại việc</option>
                  <option value="CALLBACK">Hẹn gọi lại</option>
                  <option value="HOT_ISSUE">Điểm nóng</option>
                  <option value="FOLLOW_UP">Theo dõi</option>
                  <option value="AUTO_ATTENDANCE">Điểm danh tự động</option>
                  <option value="SCHEDULE_DATA_ISSUE">Lỗi dữ liệu lịch</option>
                </select>
              </div>
              <div>
                <label htmlFor="care-task-priority-advanced" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-secondary">Độ ưu tiên</label>
                <select id="care-task-priority-advanced" value={taskAdvancedDraft.priority || ''} onChange={(event) => setTaskAdvancedDraft((current) => ({ ...current, priority: event.target.value ? event.target.value as TaskPriority : undefined }))} className="h-9 w-full rounded-xl border border-border bg-white px-3 text-sm shadow-xs outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Tất cả mức độ</option>
                  <option value="URGENT">Khẩn cấp</option>
                  <option value="HIGH">Cao</option>
                  <option value="NORMAL">Bình thường</option>
                  <option value="LOW">Thấp</option>
                </select>
              </div>
              {[
                ['due_from', 'Hạn từ ngày'],
                ['due_to', 'Hạn đến ngày'],
                ['created_from', 'Tạo từ ngày'],
                ['created_to', 'Tạo đến ngày'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`care-task-${key}`} className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-secondary">{label}</label>
                  <input id={`care-task-${key}`} type="date" value={String(taskAdvancedDraft[key as keyof TaskFilterParams] || '')} onChange={(event) => setTaskAdvancedDraft((current) => ({ ...current, [key]: event.target.value || undefined }))} className="h-9 w-full rounded-xl border border-border bg-white px-3 text-sm shadow-xs outline-none focus:ring-2 focus:ring-primary" />
                </div>
              ))}
              <div>
                <label htmlFor="care-task-assignee-id" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-secondary">ID người phụ trách</label>
                <input id="care-task-assignee-id" type="number" min="1" value={taskAdvancedDraft.assigned_to_id || ''} onChange={(event) => setTaskAdvancedDraft((current) => ({ ...current, assigned_to_id: event.target.value ? Number(event.target.value) : undefined }))} className="h-9 w-full rounded-xl border border-border bg-white px-3 text-sm shadow-xs outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label htmlFor="care-task-enrollment-id" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-secondary">Mã ghi danh</label>
                <input id="care-task-enrollment-id" type="number" min="1" value={taskAdvancedDraft.enrollment_id || ''} onChange={(event) => setTaskAdvancedDraft((current) => ({ ...current, enrollment_id: event.target.value ? Number(event.target.value) : undefined }))} className="h-9 w-full rounded-xl border border-border bg-white px-3 text-sm shadow-xs outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
          </AdvancedFilterDrawer>

          <CareTaskList
            tasks={tasks}
            loading={tasksLoading}
            page={taskPage}
            pageSize={taskPageSize}
            total={taskTotal}
            totalPages={taskTotalPages}
            onPageChange={setTaskPage}
            onPageSizeChange={(nextPageSize) => {
              setTaskPageSize(nextPageSize);
              resetTaskPage();
            }}
            onComplete={handleCompleteTask}
            onCancel={async (id) => setCancellingTaskId(id)}
            onEdit={(task) => {
              setEditingTask(task);
              setIsTaskModalOpen(true);
            }}
            onRefresh={loadTasks}
          />
        </div>
      ) : activeTab === 'logs' && !isTeacherOnly ? (
        <div className="space-y-6">
          {/* Search Enrollment Bar */}
          <div className="bg-surface p-4 rounded-2xl border border-border/80 shadow-soft">
            <form onSubmit={handleSearchEnrollmentLogs} className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-text-secondary whitespace-nowrap">
                Tra cứu theo Học viên / Ghi danh:
              </label>
              <div className="flex-1 min-w-[260px] max-w-md">
                <EnrollmentSearchSelect
                  value={pendingEnrollmentId}
                  onChange={(id) => {
                    setPendingEnrollmentId(id);
                    if (id === null) {
                      setSelectedEnrollmentId(null);
                      setLogs([]);
                    }
                  }}
                  placeholder="Tìm theo tên học viên, mã HV, mã ghi danh..."
                />
              </div>
              <Button type="submit" variant="primary" size="sm">
                Xem lịch sử
              </Button>
            </form>
          </div>

          {selectedEnrollmentId ? (
            <div className="bg-surface p-6 rounded-2xl border border-border/80 shadow-soft">
              <CareLogTimeline
                enrollmentId={selectedEnrollmentId}
                logs={logs}
                loading={logsLoading}
                onAddLog={handleAddLog}
              />
            </div>
          ) : (
            <div className="text-center py-16 bg-surface rounded-2xl border border-dashed border-border text-text-muted text-xs">
              Nhập mã ghi danh ở ô trên để xem toàn bộ lịch sử chăm sóc và ghi nhận phản hồi mới.
            </div>
          )}
        </div>
      ) : (
        /* TAB: NOTIFICATIONS */
        <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
          {/* Toolbar */}
          <div className="p-3.5 sm:px-5 border-b border-border/80 bg-surface-subtle/70 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex p-0.5 bg-surface-muted rounded-xl border border-border/70 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setNotificationFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    notificationFilter === 'all'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationFilter('unread')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    notificationFilter === 'unread'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span>Chưa đọc</span>
                  {unreadCount > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                        notificationFilter === 'unread'
                          ? 'bg-surface/20 text-white'
                          : 'bg-primary-soft text-primary'
                      }`}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationFilter('read')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    notificationFilter === 'read'
                      ? 'bg-primary text-white shadow-xs font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Đã đọc
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadNotifications(notificationFilter)}
                disabled={notificationsLoading}
                leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${notificationsLoading ? 'animate-spin' : ''}`} />}
              >
                Làm mới
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={unreadCount === 0 || markingAll}
                onClick={handleMarkAllAsRead}
                leftIcon={<CheckCheck className="w-4 h-4" />}
              >
                {markingAll ? 'Đang xử lý...' : 'Đánh dấu tất cả đã đọc'}
              </Button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="divide-y divide-border/70">
            {notificationsLoading ? (
              <div className="py-14 text-center text-xs text-text-muted">
                Đang tải danh sách thông báo...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-16 text-center text-xs text-text-muted flex flex-col items-center gap-2">
                <Bell className="w-8 h-8 text-slate-300" />
                <span>Không có thông báo nào trong mục này.</span>
              </div>
            ) : (
              notifications
                .slice((notifPage - 1) * notifPageSize, notifPage * notifPageSize)
                .map((item) => {
                const sessionDateFormatted = item.session_date
                  ? new Date(
                      item.session_date.length === 10
                        ? `${item.session_date}T00:00:00`
                        : item.session_date
                    ).toLocaleDateString('vi-VN')
                  : '—';
                const createdAtFormatted = item.created_at
                  ? new Date(item.created_at).toLocaleString('vi-VN')
                  : '—';
                const readAtFormatted = item.read_at
                  ? new Date(item.read_at).toLocaleString('vi-VN')
                  : null;
                const roleLabel = item.recipient_role === 'TEACHER' ? 'GV' : 'CSKH';

                return (
                  <div
                    key={item.id}
                    className={`p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                      !item.is_read
                        ? 'bg-blue-50/40 border-l-4 border-l-primary hover:bg-blue-50/60'
                        : 'bg-surface hover:bg-surface-subtle/60'
                    }`}
                  >
                    <div className="space-y-2 min-w-0 flex-1">
                      {/* Dòng 1: Học viên & Lớp & Buổi */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {!item.is_read && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full bg-primary shrink-0"
                            title="Chưa đọc"
                          />
                        )}
                        <span className="font-extrabold text-text-primary text-sm">
                          {item.student_name}
                        </span>
                        {item.student_code && (
                          <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary border border-border">
                            {item.student_code}
                          </span>
                        )}
                        <span className="text-text-muted">—</span>
                        <span className="font-semibold text-text-secondary">
                          Lớp <strong className="text-text-primary">{item.class_name}</strong>
                        </span>
                        <span className="text-text-muted">—</span>
                        <Badge variant="info" size="sm">
                          Buổi {item.session_number} ({sessionDateFormatted})
                        </Badge>
                      </div>

                      {/* Dòng 2: Chi tiết lệch điểm danh */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-text-secondary font-medium">
                          Trạng thái của bạn ({roleLabel}):
                        </span>
                        {renderAttendanceStatusBadge(item.previous_status)}
                        <ArrowRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                        <span className="text-text-secondary font-medium">
                          Admin/Quản lý chốt:
                        </span>
                        {renderAttendanceStatusBadge(item.admin_status)}
                      </div>

                      {/* Dòng 3: Người sửa & Thời gian */}
                      <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-2">
                        <span>
                          Bởi: <strong className="text-text-secondary">{item.actor_name}</strong>
                        </span>
                        <span>·</span>
                        <span>Lúc: {createdAtFormatted}</span>
                      </div>
                    </div>

                    {/* Cột hành động */}
                    <div className="shrink-0 flex items-center gap-2">
                      {!item.is_read ? (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={markingId === item.id}
                          onClick={() => handleMarkAsRead(item.id)}
                          leftIcon={<Check className="w-3.5 h-3.5" />}
                        >
                          {markingId === item.id ? 'Đang lưu...' : 'Đã xem'}
                        </Button>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <Badge variant="neutral" size="sm">
                            Đã xem
                          </Badge>
                          {readAtFormatted && (
                            <span className="text-[10px] text-text-muted">
                              {readAtFormatted}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {!notificationsLoading && notifications.length > 0 && (() => {
            const totalPages = Math.max(1, Math.ceil(notifications.length / notifPageSize));
            const safePage = Math.min(notifPage, totalPages);
            const startIdx = (safePage - 1) * notifPageSize + 1;
            const endIdx = Math.min(safePage * notifPageSize, notifications.length);
            return (
              <div className="px-5 py-3 border-t border-border/80 bg-surface-muted/30 flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
                <span>
                  Hiển thị <strong className="text-text-primary">{startIdx}</strong>–
                  <strong className="text-text-primary">{endIdx}</strong> /{' '}
                  <strong className="text-text-primary">{notifications.length}</strong> thông báo
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span>Mỗi trang:</span>
                    <select
                      value={notifPageSize}
                      onChange={(e) => {
                        setNotifPageSize(Number(e.target.value));
                        setNotifPage(1);
                      }}
                      className="bg-surface border border-border rounded-lg px-2 py-1 text-xs font-semibold text-text-primary"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNotifPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="h-7 px-2"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <span className="px-2 font-semibold text-text-primary">
                      {safePage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNotifPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="h-7 px-2"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Task Modal */}
      <CareTaskModal
        isOpen={isTaskModalOpen}
        initialTask={editingTask}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSubmit={handleTaskSubmit}
      />

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={cancellingTaskId !== null}
        onClose={() => setCancellingTaskId(null)}
        title="Xác nhận hủy nhiệm vụ"
        size="sm"
        footer={
          <div className="flex items-center justify-end space-x-2">
            <Button variant="outline" size="sm" onClick={() => setCancellingTaskId(null)}>
              Đóng
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmCancelTask}>
              Xác nhận hủy
            </Button>
          </div>
        }
      >
        <div className="flex items-start space-x-3 text-xs text-text-secondary">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p>
            Bạn có chắc chắn muốn hủy nhiệm vụ chăm sóc này không? Trạng thái nhiệm vụ sẽ được chuyển thành ĐÃ HỦY.
          </p>
        </div>
      </Modal>
    </PageContainer>
  );
};
