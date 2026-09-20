import React, { useState, useEffect } from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { CareTaskList } from '../components/CareTaskList';
import { CareTaskModal } from '../components/CareTaskModal';
import { CareLogTimeline } from '../components/CareLogTimeline';
import { careApi } from '../api/care.api';
import { CareTask, CareLog, TaskFilterParams, CreateCareTaskDTO, UpdateCareTaskDTO, CreateCareLogDTO } from '../types/care.types';
import { Plus, ListTodo, History, Search } from 'lucide-react';

export const CarePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'logs'>('tasks');

  // Task State
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<TaskFilterParams>({ status: 'PENDING' });
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CareTask | null>(null);

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
      alert(err.response?.data?.error?.message || 'Không thể tải nhật ký chăm sóc của mã ghi danh này');
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
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Lỗi khi hoàn thành nhiệm vụ');
    }
  };

  const handleCancelTask = async (taskId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy nhiệm vụ này?')) return;
    try {
      await careApi.cancelTask(taskId);
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Lỗi khi hủy nhiệm vụ');
    }
  };

  const handleTaskSubmit = async (data: CreateCareTaskDTO | UpdateCareTaskDTO) => {
    if (editingTask) {
      await careApi.updateTask(editingTask.id, data as UpdateCareTaskDTO);
    } else {
      await careApi.createTask(data as CreateCareTaskDTO);
    }
    loadTasks();
  };

  // Log Actions
  const handleAddLog = async (data: CreateCareLogDTO) => {
    if (!selectedEnrollmentId) return;
    await careApi.createLog(selectedEnrollmentId, data);
    loadLogs(selectedEnrollmentId);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Chăm sóc Học viên & Nhiệm vụ CS"
        description="Theo dõi toàn diện nhật ký trao đổi theo mốc buổi học và quản lý danh sách việc cần làm (gọi lại, xử lý điểm nóng)"
        actions={
          activeTab === 'tasks' ? (
            <Button
              onClick={() => {
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Tạo nhiệm vụ mới
            </Button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === 'tasks'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <ListTodo className="w-4 h-4" />
          Nhiệm vụ Chăm sóc (Care Tasks)
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === 'logs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <History className="w-4 h-4" />
          Nhật ký & Tiến trình Chăm sóc (Care Logs)
        </button>
      </div>

      {/* Content */}
      {activeTab === 'tasks' ? (
        <CareTaskList
          tasks={tasks}
          loading={tasksLoading}
          filter={taskFilter}
          onFilterChange={setTaskFilter}
          onComplete={handleCompleteTask}
          onCancel={handleCancelTask}
          onEdit={(task) => {
            setEditingTask(task);
            setIsTaskModalOpen(true);
          }}
          onRefresh={loadTasks}
        />
      ) : (
        <div className="space-y-6">
          {/* Search Enrollment Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <form onSubmit={handleSearchEnrollmentLogs} className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
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
                  className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              </div>
              <Button type="submit" size="sm">
                Xem lịch sử
              </Button>
            </form>
          </div>

          {selectedEnrollmentId ? (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <CareLogTimeline
                enrollmentId={selectedEnrollmentId}
                logs={logs}
                loading={logsLoading}
                onAddLog={handleAddLog}
              />
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200 text-gray-500">
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
    </PageContainer>
  );
};
