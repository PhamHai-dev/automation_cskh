import React, { useState, useEffect } from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { CareTaskList } from '../components/CareTaskList';
import { CareTaskModal } from '../components/CareTaskModal';
import { CareLogTimeline } from '../components/CareLogTimeline';
import { careApi } from '../api/care.api';
import { CareTask, CareLog, TaskFilterParams, CreateCareTaskDTO, UpdateCareTaskDTO, CreateCareLogDTO } from '../types/care.types';
import { Plus, ListTodo, History, Search, AlertTriangle } from 'lucide-react';

export const CarePage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'tasks' | 'logs'>('tasks');

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

  // Fetch tasks
  const loadTasks = async () => {
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
    if (activeTab === 'tasks') {
      loadTasks();
    }
  }, [taskFilter, activeTab]);

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

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Chăm sóc Học viên & Nhiệm vụ CS"
        actions={
          activeTab === 'tasks' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              className="flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
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
        items={[
          { value: 'tasks', label: 'Nhiệm vụ chăm sóc', icon: <ListTodo /> },
          { value: 'logs', label: 'Nhật ký chăm sóc', icon: <History /> },
        ]}
      />

      {/* Content */}
      {activeTab === 'tasks' ? (
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
      ) : (
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
