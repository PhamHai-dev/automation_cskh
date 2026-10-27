import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, RotateCcw, Settings } from 'lucide-react';
import { QUICK_LINK_REGISTRY, QuickLinkDef } from '../../constants/quickLinks';
import { preferencesApi } from '../../../preferences/api/preferences.api';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { useToast } from '../../../../components/ui/Toast';

interface QuickLinksSectionProps {
  userRoles: string[];
}

const LOCAL_STORAGE_KEY = 'cskh_pref_home.quick_links';

const buildDefaultMap = (items: QuickLinkDef[]): Record<string, boolean> => {
  const map: Record<string, boolean> = {};
  for (const item of items) {
    map[item.key] = item.pinnedByDefault;
  }
  return map;
};

export const QuickLinksSection: React.FC<QuickLinksSectionProps> = ({ userRoles }) => {
  const toast = useToast();

  const allowedItems = useMemo(
    () =>
      QUICK_LINK_REGISTRY.filter((item) =>
        item.allowedRoles.some((role) => userRoles.includes(role))
      ),
    [userRoles]
  );

  const defaultMap = useMemo(() => buildDefaultMap(allowedItems), [allowedItems]);

  const [pinnedMap, setPinnedMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        return { ...defaultMap, ...parsed };
      }
    } catch {
      // Ignore storage parse error
    }
    return defaultMap;
  });

  const [draftMap, setDraftMap] = useState<Record<string, boolean>>(pinnedMap);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await preferencesApi.get('home.quick_links');
        if (cancelled) return;
        if (res?.value && typeof res.value === 'object') {
          const merged = { ...defaultMap, ...res.value };
          setPinnedMap(merged);
          setDraftMap(merged);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(res.value));
        }
      } catch {
        // Fallback to localStorage or defaultMap silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultMap]);

  const visibleLinks = useMemo(() => {
    const filtered = allowedItems.filter((item) => pinnedMap[item.key]);
    return filtered.length > 0 ? filtered : allowedItems.filter((item) => item.pinnedByDefault);
  }, [allowedItems, pinnedMap]);

  const handleOpenCustomize = () => {
    setDraftMap(pinnedMap);
    setCustomizeOpen(true);
  };

  const handleToggleDraft = (key: string) => {
    setDraftMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleResetDefault = () => {
    setDraftMap(defaultMap);
  };

  const handleSaveCustomize = async () => {
    const selectedCount = Object.values(draftMap).filter(Boolean).length;
    if (selectedCount === 0) {
      toast.warning('Vui lòng chọn ít nhất 1 phân hệ hiển thị.');
      return;
    }

    setSaving(true);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(draftMap));
      setPinnedMap(draftMap);
      try {
        await preferencesApi.set('home.quick_links', draftMap);
      } catch {
        // Already saved in localStorage as fallback
      }
      toast.success('Đã lưu cấu hình Truy cập nhanh');
      setCustomizeOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3.5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-text-primary leading-tight">
            Truy cập nhanh
          </h2>
          <p className="text-xs text-text-muted mt-0.5">Các phân hệ thường dùng</p>
        </div>

        <button
          type="button"
          onClick={handleOpenCustomize}
          className="inline-flex items-center gap-1.5 rounded-xl bg-surface border border-border/80 hover:border-slate-300 hover:bg-surface-muted px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary shadow-xs transition-colors"
        >
          <Settings className="w-3.5 h-3.5 text-text-muted" />
          <span>Tùy chỉnh</span>
        </button>
      </div>

      {/* 3-Column Quick Launch Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleLinks.map((item) => (
          <Link
            key={item.key}
            to={item.path}
            className="group bg-surface rounded-2xl border border-border/80 p-4 sm:p-5 shadow-soft hover:shadow-soft-md hover:border-primary/40 transition-all duration-200 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${item.iconClass}`}
              >
                {item.icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors truncate">
                  {item.title}
                </h3>
                <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>

            <span className="w-8 h-8 rounded-full bg-surface-muted group-hover:bg-primary group-hover:text-white text-text-muted flex items-center justify-center shrink-0 transition-colors">
              <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        ))}
      </div>

      {/* Customize Quick Links Modal */}
      <Modal
        isOpen={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Tùy chỉnh Truy cập nhanh"
        description="Chọn các phân hệ bạn muốn ghim trên Trang chủ Điều phối."
        size="md"
        footer={
          <div className="flex items-center justify-between w-full gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={handleResetDefault}
            >
              Mặc định
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCustomizeOpen(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                isLoading={saving}
                onClick={handleSaveCustomize}
              >
                Lưu thay đổi
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {allowedItems.map((item) => {
            const checked = Boolean(draftMap[item.key]);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleToggleDraft(item.key)}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all ${
                  checked
                    ? 'border-primary bg-primary-soft/50 text-text-primary'
                    : 'border-border/80 bg-surface hover:bg-surface-muted text-text-secondary'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.iconClass}`}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-text-primary truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-text-muted truncate">
                      {item.description}
                    </div>
                  </div>
                </div>

                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    checked
                      ? 'bg-primary border-primary text-white'
                      : 'border-border bg-white text-transparent'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </Modal>
    </section>
  );
};
