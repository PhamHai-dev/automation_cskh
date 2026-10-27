import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Menu,
  LogOut,
  Search,
  Bell,
  X,
  Users,
  GraduationCap,
  UserCheck,
  CheckCheck,
  Loader2,
  ArrowRight,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/ui/Badge';
import { getBreadcrumbs } from '../lib/breadcrumbs';
import { dashboardApi } from '../features/dashboard/api/dashboard.api';
import { GlobalSearchPayload } from '../features/dashboard/types/home.types';
import { careApi } from '../features/care/api/care.api';
import { AttendanceNotificationItem } from '../features/care/types/care.types';

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

const ROLE_DISPLAY_NAMES: Record<
  string,
  { label: string; variant: 'success' | 'info' | 'warning' | 'neutral' | 'accent' | 'danger' }
> = {
  ADMIN: { label: 'Quản trị viên', variant: 'danger' },
  MANAGE: { label: 'Quản lý nhóm', variant: 'warning' },
  CS: { label: 'Nhân viên CSKH', variant: 'info' },
  TEACHER: { label: 'Giáo viên', variant: 'accent' },
};

const EMPTY_SEARCH: GlobalSearchPayload = {
  students: [],
  classes: [],
  teachers: [],
};

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, sidebarOpen }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const breadcrumbs = useMemo(() => getBreadcrumbs(location.pathname), [location.pathname]);

  // ── Global Search state ─────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<GlobalSearchPayload>(EMPTY_SEARCH);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Notifications state ─────────────────────────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<AttendanceNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  // ── User menu state ─────────────────────────────────────────────────────────
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const primaryRole = user?.roles?.[0] || 'CS';
  const roleConfig = ROLE_DISPLAY_NAMES[primaryRole] || { label: primaryRole, variant: 'neutral' as const };
  const canSearch = Boolean(
    user?.roles?.some((r) => ['ADMIN', 'MANAGE', 'CS'].includes(r))
  );

  // Debounced 300ms global search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || !canSearch) {
      setSearchResults(EMPTY_SEARCH);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await dashboardApi.searchGlobal(trimmed, 5);
        if (!cancelled) {
          setSearchResults({
            students: res?.students || [],
            classes: res?.classes || [],
            teachers: res?.teachers || [],
          });
        }
      } catch {
        if (!cancelled) {
          setSearchResults(EMPTY_SEARCH);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, canSearch]);

  // Load care notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setNotifLoading(true);
      const res = await careApi.listNotifications({ limit: 10 });
      setNotifications(res.items || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // Silently ignore if notifications endpoint is unavailable for this role
    } finally {
      setNotifLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  // Close popovers on outside click or Escape key
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setSearchFocused(false);
      }
      if (notifContainerRef.current && !notifContainerRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchFocused(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await careApi.markAllNotificationsRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch {
      // Ignore error
    }
  };

  const handleNotificationClick = async (item: AttendanceNotificationItem) => {
    if (!item.is_read) {
      try {
        await careApi.markNotificationRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Ignore error
      }
    }
    setNotifOpen(false);
    navigate('/care?tab=notifications');
  };

  const handleSelectSearchResult = (targetPath: string) => {
    setSearchFocused(false);
    setSearchQuery('');
    navigate(targetPath);
  };

  const handleLogout = async () => {
    setUserMenuOpen(false);
    if (window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) {
      await logout();
      navigate('/login');
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'AD';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const totalSearchHits =
    searchResults.students.length +
    searchResults.classes.length +
    searchResults.teachers.length;
  const showSearchDropdown = searchFocused && searchQuery.trim().length > 0 && canSearch;

  return (
    <header className="h-16 bg-surface/95 backdrop-blur-md border-b border-border/80 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* ── Left: Sidebar Toggle + Dynamic Breadcrumb ────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        <button
          onClick={onToggleSidebar}
          className={`p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors ${
            sidebarOpen ? 'lg:hidden' : 'flex'
          }`}
          aria-label="Mở thanh điều hướng"
          title="Mở thanh điều hướng"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-xs sm:text-sm min-w-0"
        >
          {breadcrumbs.map((seg, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${seg.label}-${idx}`}>
                {idx > 0 && (
                  <span className="text-text-muted/60 select-none font-normal">/</span>
                )}
                {!isLast ? (
                  <span className="text-text-muted font-medium truncate hidden sm:inline">
                    {seg.label}
                  </span>
                ) : (
                  <span className="text-text-primary font-semibold truncate">
                    {seg.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* ── Center: Global Search Input ──────────────────────────────────────── */}
      {canSearch && (
        <div
          ref={searchContainerRef}
          className="relative flex-1 max-w-md mx-auto hidden md:block"
        >
          <div
            className={`flex items-center gap-2.5 h-10 px-4 rounded-full bg-surface-muted/80 border transition-all duration-150 ${
              searchFocused
                ? 'bg-surface border-primary ring-2 ring-primary/15 shadow-xs'
                : 'border-border/80 hover:border-slate-300'
            }`}
          >
            <Search className="w-4 h-4 text-text-muted shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!searchFocused) setSearchFocused(true);
              }}
              placeholder="Tìm kiếm học viên, lớp học, giáo viên..."
              className="w-full bg-transparent text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            {searchLoading && (
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
            )}
            {searchQuery && !searchLoading && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="p-0.5 rounded-full text-text-muted hover:text-text-primary hover:bg-slate-200/70 transition-colors"
                aria-label="Xóa tìm kiếm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showSearchDropdown && (
            <div className="absolute left-0 right-0 mt-2 bg-surface rounded-2xl border border-border shadow-soft-lg overflow-hidden z-50 max-h-[420px] overflow-y-auto">
              {searchLoading && totalSearchHits === 0 ? (
                <div className="p-6 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Đang tìm kiếm...</span>
                </div>
              ) : totalSearchHits === 0 ? (
                <div className="p-6 text-center text-xs text-text-muted">
                  Không tìm thấy kết quả phù hợp cho{' '}
                  <span className="font-semibold text-text-primary">
                    &ldquo;{searchQuery.trim()}&rdquo;
                  </span>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {/* Học viên */}
                  {searchResults.students.length > 0 && (
                    <div className="p-2">
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                        <span>Học viên</span>
                      </div>
                      {searchResults.students.map((s) => (
                        <button
                          key={`student-${s.id}`}
                          type="button"
                          onClick={() =>
                            handleSelectSearchResult(
                              `/students?search=${encodeURIComponent(s.full_name)}`
                            )
                          }
                          className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-surface-muted transition-colors flex items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-text-primary group-hover:text-primary truncate">
                              {s.full_name}
                            </div>
                            <div className="text-[11px] text-text-muted truncate">
                              {s.subtitle}
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Lớp học */}
                  {searchResults.classes.length > 0 && (
                    <div className="p-2">
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Lớp học</span>
                      </div>
                      {searchResults.classes.map((c) => (
                        <button
                          key={`class-${c.id}`}
                          type="button"
                          onClick={() =>
                            handleSelectSearchResult(
                              `/classes?search=${encodeURIComponent(c.class_name)}`
                            )
                          }
                          className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-surface-muted transition-colors flex items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-text-primary group-hover:text-primary truncate">
                              {c.class_name}
                            </div>
                            <div className="text-[11px] text-text-muted truncate">
                              {c.subtitle}
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Giáo viên */}
                  {searchResults.teachers.length > 0 && (
                    <div className="p-2">
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-violet-600" />
                        <span>Giáo viên</span>
                      </div>
                      {searchResults.teachers.map((t) => (
                        <button
                          key={`teacher-${t.id}`}
                          type="button"
                          onClick={() =>
                            handleSelectSearchResult(
                              `/teachers?search=${encodeURIComponent(t.name)}`
                            )
                          }
                          className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-surface-muted transition-colors flex items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-text-primary group-hover:text-primary truncate">
                              {t.name}
                            </div>
                            <div className="text-[11px] text-text-muted truncate">
                              {t.subtitle}
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Right: Notifications Bell + User Profile & Logout ────────────────── */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Notification Bell */}
        <div ref={notifContainerRef} className="relative">
          <button
            type="button"
            onClick={() => {
              const next = !notifOpen;
              setNotifOpen(next);
              if (next) loadNotifications();
            }}
            className="relative w-9 h-9 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
            aria-label="Thông báo"
            title="Thông báo"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface rounded-2xl border border-border shadow-soft-lg overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/80 bg-surface-subtle/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-text-primary">Thông báo</span>
                  {unreadCount > 0 && (
                    <Badge variant="danger" size="sm">
                      {unreadCount} mới
                    </Badge>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Đánh dấu đã đọc tất cả</span>
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
                {notifLoading && notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-text-muted flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Đang tải thông báo...</span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-text-muted">
                    Chưa có thông báo mới.
                  </div>
                ) : (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNotificationClick(item)}
                      className={`w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors flex items-start gap-3 ${
                        !item.is_read ? 'bg-primary-soft/40' : ''
                      }`}
                    >
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                          !item.is_read ? 'bg-primary' : 'bg-slate-300'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-text-primary truncate">
                          Cập nhật điểm danh: {item.student_name}
                        </div>
                        <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
                          Lớp {item.class_name} • Buổi #{item.session_number} ({item.session_date}) bởi{' '}
                          {item.actor_name}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="p-2.5 border-t border-border/80 bg-surface-subtle/50 text-center">
                <Link
                  to="/care?tab=notifications"
                  onClick={() => setNotifOpen(false)}
                  className="text-xs font-semibold text-primary hover:text-primary-hover inline-flex items-center gap-1"
                >
                  <span>Xem tất cả thông báo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Profile & Dropdown */}
        {user && (
          <div ref={userMenuRef} className="relative pl-2 sm:pl-3 border-l border-border/70">
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2.5 py-1 px-1.5 rounded-xl hover:bg-surface-muted transition-colors"
              title="Tài khoản người dùng"
            >
              <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                {getInitials(user.name)}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-text-primary leading-tight">
                  {user.name || roleConfig.label}
                </span>
                <span className="text-[10px] text-text-muted leading-tight">
                  {user.email}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-text-muted hidden sm:block" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-surface rounded-2xl border border-border shadow-soft-lg py-1.5 z-50">
                <div className="px-3.5 py-2.5 border-b border-border/70">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-text-primary truncate">
                      {user.name}
                    </span>
                    <Badge variant={roleConfig.variant} size="sm">
                      {roleConfig.label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-text-muted truncate mt-0.5">
                    {user.email}
                  </p>
                </div>

                <div className="p-1">
                  <Link
                    to="/settings/preferences"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
                  >
                    <Settings className="w-4 h-4 text-text-muted" />
                    <span>Cấu hình cá nhân</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-danger hover:bg-rose-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
