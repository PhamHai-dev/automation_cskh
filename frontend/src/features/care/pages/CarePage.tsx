import React, { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { useAuth } from '../../../contexts/AuthContext';
import { CareTaskList } from '../components/CareTaskList';
import { CareTaskModal } from '../components/CareTaskModal';
import { CareLogTimeline } from '../components/CareLogTimeline';
import { careApi } from '../api/care.api';
import {
  CareTask,
  CareLog,
  TaskFilterParams,
  CreateCareTaskDTO,
  UpdateCareTaskDTO,
  CreateCareLogDTO,
  AttendanceNotificationItem,
} from '../types/care.types';
import {
  Plus,
  ListTodo,
  History,
  Search,
  AlertTriangle,
  Bell,
  CheckCheck,
  Check,
  ArrowRight,
  RefreshCw,
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
    className: 'bg-slate-200 text-slate-800 border-slate-400 font-extrabold',
  },
};

const renderAttendanceStatusBadge = (status: string | null) => {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border border-slate-200 bg-slate-100 text-slate-600">
        Chưa điểm danh
      </span>
    );
  }
  const cfg = ATTENDANCE_STATUS_BADGE[status] || {
    label: status,
    className: 'bg-slate-100 text-slate-700 border-slate-300 font-bold',
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
  const isTeacherOnly = Boolean(
    user?.roles.includes('TEACHER') &&
      !user?.roles.includes('ADMIN') &&
      !user?.roles.includes('MANAGE') &&
      !user?.roles.includes('CS')
  );

  const [activeTab, setActiveTab] = useState<CareTab>(() =>
    isTeacherOnly ? 'notifications' : 'tasks'
  );

  useEffect(() => {
    if (isTeacherOnly && activeTab !== 'notifications') {
      setActiveTab('notifications');
    }
  }, [isTeacherOnly, activeTab]);

  // Task State
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<TaskFilterParams>({ status: 'PENDING' });
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CareTask | null>(null);

  // Cancel Task Confirmation Modal State
  const [cancellingTaskId, setCancellingTaskId] = useState<number | null>(null);

  // Log State
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null);
  const [inputEnrollmentId, setInputEnrollmentId] = useState('');
  const [logs, setLogs] = useState<CareLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState<AttendanceNotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState<boolean>(false);

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
      const data = await careApi.listTasks(taskFilter);
      setTasks(data);
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
  }, [taskFilter, activeTab, isTeacherOnly]);

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
    const id = parseInt(inputEnrollmentId, 10);
    if (!id) return;
    setSelectedEnrollmentId(id);
    loadLogs(id);
  };

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
        title={isTeacherOnly ? 'Thông báo Điểm danh' : 'Quản lý Chăm sóc Học viên & Nhiệm vụ CS'}
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

      <HorizontalTabs
        ariaLabel="Nội dung chăm sóc học viên"
        value={activeTab}
        onChange={setActiveTab}
        className="mb-6"
        items={tabItems}
      />

      {/* Content */}
      {activeTab === 'tasks' && !isTeacherOnly ? (
        <CareTaskList
          tasks={tasks}
          loading={tasksLoading}
          filter={taskFilter}
          onFilterChange={setTaskFilter}
          onComplete={handleCompleteTask}
          onCancel={async (id) => setCancellingTaskId(id)}
          onEdit={(task) => {
            setEditingTask(task);
            setIsTaskModalOpen(true);
          }}
          onRefresh={loadTasks}
        />
      ) : activeTab === 'logs' && !isTeacherOnly ? (
        <div className="space-y-6">
          {/* Search Enrollment Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-soft">
            <form onSubmit={handleSearchEnrollmentLogs} className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                Tra cứu theo Mã Ghi danh (Enrollment ID):
              </label>
              <div className="relative flex-1 max-w-xs">
                <input
                  type="number"
                  min={1}
                  required
                  placeholder="Nhập ID (VD: 1, 2, ...)"
                  value={inputEnrollmentId}
                  onChange={(e) => setInputEnrollmentId(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
              </div>
              <Button type="submit" variant="primary" size="sm">
                Xem lịch sử
              </Button>
            </form>
          </div>

          {selectedEnrollmentId ? (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-soft">
              <CareLogTimeline
                enrollmentId={selectedEnrollmentId}
                logs={logs}
                loading={logsLoading}
                onAddLog={handleAddLog}
              />
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
              Nhập mã ghi danh ở ô trên để xem toàn bộ lịch sử chăm sóc và ghi nhận phản hồi mới.
            </div>
          )}
        </div>
      ) : (
        /* TAB: NOTIFICATIONS */
        <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
          {/* Toolbar */}
          <div className="p-3.5 sm:px-5 border-b border-border/80 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
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
                          ? 'bg-white/20 text-white'
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
              notifications.map((item) => {
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
                        : 'bg-surface hover:bg-slate-50/60'
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
                          <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
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
        <div className="flex items-start space-x-3 text-xs text-slate-700">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p>
            Bạn có chắc chắn muốn hủy nhiệm vụ chăm sóc này không? Trạng thái nhiệm vụ sẽ được chuyển thành ĐÃ HỦY.
          </p>
        </div>
      </Modal>
    </PageContainer>
  );
};
