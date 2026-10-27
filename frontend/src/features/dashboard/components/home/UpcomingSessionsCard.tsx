import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Calendar, MapPin, Users } from 'lucide-react';
import { HomeUpcomingSessionItem } from '../../types/home.types';
import { Badge } from '../../../../components/ui/Badge';

interface UpcomingSessionsCardProps {
  sessions: HomeUpcomingSessionItem[];
  loading?: boolean;
}

const STATUS_STYLE: Record<
  HomeUpcomingSessionItem['display_status'],
  {
    bar: string;
    time: string;
    badgeVariant: 'success' | 'info' | 'neutral';
  }
> = {
  ONGOING: {
    bar: 'bg-emerald-500',
    time: 'text-emerald-600',
    badgeVariant: 'success',
  },
  UPCOMING: {
    bar: 'bg-blue-600',
    time: 'text-blue-600',
    badgeVariant: 'info',
  },
  COMPLETED: {
    bar: 'bg-slate-300',
    time: 'text-text-secondary',
    badgeVariant: 'neutral',
  },
};

export const UpcomingSessionsCard: React.FC<UpcomingSessionsCardProps> = ({
  sessions,
  loading = false,
}) => {
  const navigate = useNavigate();

  return (
    <div className="bg-surface rounded-2xl border border-border/80 shadow-soft flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/70">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </span>
          <h3 className="text-sm sm:text-base font-bold text-text-primary">
            Lịch học sắp tới
          </h3>
        </div>
        <Link
          to="/classes"
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
        ) : sessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-text-primary">
              Chưa có ca học nào sắp diễn ra
            </p>
            <p className="text-xs text-text-muted mt-1 max-w-xs">
              Các buổi học trong ngày hoặc sắp tới sẽ được hiển thị tự động tại đây.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sessions.map((session) => {
              const cfg = STATUS_STYLE[session.display_status] || STATUS_STYLE.UPCOMING;
              const displayTitle =
                session.level && !session.class_name.includes(session.level)
                  ? `${session.class_name} - ${session.level}`
                  : session.class_name;

              return (
                <div
                  key={session.session_id}
                  onClick={() =>
                    navigate(
                      `/classes?search=${encodeURIComponent(session.class_name)}`
                    )
                  }
                  className="group flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/70 bg-surface hover:bg-surface-subtle hover:border-slate-300 transition-all cursor-pointer"
                >
                  {/* Left: Colored Vertical Bar + Time + Class Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`w-1 self-stretch rounded-full shrink-0 ${cfg.bar}`}
                    />
                    <div className="w-12 shrink-0 leading-tight">
                      <div className={`text-xs sm:text-sm font-extrabold ${cfg.time}`}>
                        {session.start_time}
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        {session.end_time}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 pl-1 border-l border-border/60">
                      <div className="text-xs sm:text-sm font-bold text-text-primary group-hover:text-primary transition-colors truncate">
                        {displayTitle}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-text-muted truncate mt-0.5">
                        <MapPin className="w-3 h-3 text-text-muted shrink-0" />
                        <span className="truncate">{session.subtitle}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Status Badge + Student Count */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={cfg.badgeVariant} size="sm">
                      {session.display_status_label}
                    </Badge>
                    <div className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted">
                      <Users className="w-3 h-3" />
                      <span>{session.student_count} HV</span>
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
