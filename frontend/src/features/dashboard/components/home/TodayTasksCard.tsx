import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  MessageSquare,
  MoreVertical,
  Phone,
  Plus,
} from 'lucide-react';
import { HomeTodayTaskItem } from '../../types/home.types';
import { Badge } from '../../../../components/ui/Badge';
import { careApi } from '../../../care/api/care.api';
import { useToast } from '../../../../components/ui/Toast';

interface TodayTasksCardProps {
  tasks: HomeTodayTaskItem[];
  loading?: boolean;
  onTaskCompleted?: (taskId: number) => void;
}

const getTaskIconConfig = (task: HomeTodayTaskItem) => {
  if (task.type === 'HOT_ISSUE' || task.priority === 'URGENT') {
    return {
      icon: <FileText className="w-4 h-4" />,
      className: 'bg-rose-50 text-rose-500 border-rose-100',
    };
  }
  if (task.type === 'CALLBACK') {
    return {
      icon: <Phone className="w-4 h-4" />,
      className: 'bg-blue-50 text-blue-600 border-blue-100',
    };
  }
  return {
    icon: <MessageSquare className="w-4 h-4" />,
    className: 'bg-amber-50 text-amber-600 border-amber-100',
  };
};

export const TodayTasksCard: React.FC<TodayTasksCardProps> = ({
  tasks,
  loading = false,
  onTaskCompleted,
}) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const handleCompleteTask = async (task: HomeTodayTaskItem) => {
    setOpenMenuId(null);
    setCompletingId(task.id);
    try {
      await careApi.completeTask(task.id);
      toast.success(`Đã hoàn thành: ${task.title}`);
      onTaskCompleted?.(task.id);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          'Không thể cập nhật trạng thái công việc'
      );
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div
      ref={menuContainerRef}
      className="bg-surface rounded-2xl border border-border/80 shadow-soft flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/70">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4" />
          </span>
          <h3 className="text-sm sm:text-base font-bold text-text-primary">
            Công việc hôm nay
          </h3>
        </div>
        <Link
          to="/care"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover transition-colors"
        >
          <span>Xem tất cả</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-16 rounded-2xl bg-surface-muted/70 animate-pulse"
              />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-text-primary">
              Không có công việc tồn đọng hôm nay
            </p>
            <p className="text-xs text-text-muted mt-1 max-w-xs">
              Mọi yêu cầu chăm sóc học viên trong ngày đã được xử lý hoặc chưa có lịch hẹn mới.
            </p>
            <Link
              to="/care"
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary-soft text-primary hover:bg-blue-100 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tạo nhiệm vụ mới</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((task) => {
              const iconCfg = getTaskIconConfig(task);
              const isMenuOpen = openMenuId === task.id;
              const isCompleting = completingId === task.id;

              return (
                <div
                  key={task.id}
                  className="group relative flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/70 bg-surface hover:bg-surface-subtle hover:border-slate-300 transition-all"
                >
                  {/* Left: Icon + Title + Subtitle */}
                  <div
                    onClick={() =>
                      navigate(
                        task.enrollment_id
                          ? `/care?enrollment_id=${task.enrollment_id}`
                          : '/care'
                      )
                    }
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  >
                    <span
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconCfg.className}`}
                    >
                      {iconCfg.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-bold text-text-primary group-hover:text-primary transition-colors truncate">
                        {task.title}
                      </div>
                      <div className="text-[11px] sm:text-xs text-text-muted truncate mt-0.5">
                        {task.subtitle}
                      </div>
                    </div>
                  </div>

                  {/* Right: Status Badge + Time + MoreVertical Menu */}
                  <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                    <Badge
                      variant={task.badge_variant}
                      size="sm"
                      className="hidden sm:inline-flex"
                    >
                      {task.badge_label}
                    </Badge>

                    <div className="text-right leading-tight min-w-[52px]">
                      <div className="text-xs font-bold text-text-primary">
                        {task.time_label}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {task.date_label}
                      </div>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        disabled={isCompleting}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(isMenuOpen ? null : task.id);
                        }}
                        className="w-7 h-7 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-muted flex items-center justify-center transition-colors"
                        aria-label="Tác vụ nhanh"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 mt-1.5 w-48 bg-surface rounded-xl border border-border shadow-soft-lg py-1 z-30">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              navigate(
                                task.enrollment_id
                                  ? `/care?enrollment_id=${task.enrollment_id}`
                                  : '/care'
                              );
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
                            <span>Mở trang chăm sóc</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCompleteTask(task)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Hoàn thành công việc</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
