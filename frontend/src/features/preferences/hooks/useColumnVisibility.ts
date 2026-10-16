import { useCallback, useEffect, useMemo, useState } from 'react';
import { preferencesApi } from '../api/preferences.api';
import {
  PreferenceScope,
  ColumnMeta,
  COLUMNS_BY_SCOPE,
  mergeVisibility,
  computeDelta,
} from '../columns';
import { useToast } from '../../../components/ui/Toast';

export interface UseColumnVisibilityResult {
  loading: boolean;
  saving: boolean;
  /** Merged visibility map (default + saved) — use in table rendering */
  visible: Record<string, boolean>;
  /** Draft state (mutable before saving) — use in Settings UI */
  draft: Record<string, boolean>;
  dirty: boolean;
  columns: ColumnMeta[];
  setDraftValue: (key: string, value: boolean) => void;
  setAll: (value: boolean) => void;
  resetToDefault: () => void;
  save: () => Promise<boolean>;
}

const cache = new Map<PreferenceScope, Record<string, boolean>>();
const cacheListeners = new Set<() => void>();

const notifyCacheChange = () => cacheListeners.forEach((fn) => fn());

export const useColumnVisibility = (scope: PreferenceScope): UseColumnVisibilityResult => {
  const toast = useToast();
  const columns = COLUMNS_BY_SCOPE[scope] ?? [];

  const [loading, setLoading] = useState(!cache.has(scope));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>(cache.get(scope) ?? {});
  const [draft, setDraft] = useState<Record<string, boolean>>(
    mergeVisibility(columns, cache.get(scope) ?? {})
  );

  // Load once per scope (use cache to avoid re-fetch on tab switches)
  useEffect(() => {
    let cancelled = false;
    if (cache.has(scope)) {
      const cached = cache.get(scope)!;
      setSaved(cached);
      setDraft(mergeVisibility(columns, cached));
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const data = await preferencesApi.get(scope);
        if (cancelled) return;
        const value = (data?.value ?? {}) as Record<string, boolean>;
        cache.set(scope, value);
        setSaved(value);
        setDraft(mergeVisibility(columns, value));
      } catch {
        // Graceful fallback to defaults — do not block the page
        cache.set(scope, {});
        setSaved({});
        setDraft(mergeVisibility(columns, {}));
        toast.warning('Không tải được cấu hình cột cá nhân, dùng mặc định');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Refresh draft if cache changes from another instance (e.g. after Settings save)
  useEffect(() => {
    const listener = () => {
      const cached = cache.get(scope);
      if (cached) {
        setSaved(cached);
        setDraft(mergeVisibility(columns, cached));
      }
    };
    cacheListeners.add(listener);
    return () => {
      cacheListeners.delete(listener);
    };
  }, [scope]);

  const visible = useMemo(() => mergeVisibility(columns, saved), [columns, saved]);
  const dirty = useMemo(() => JSON.stringify(computeDelta(columns, draft)) !== JSON.stringify(computeDelta(columns, mergeVisibility(columns, saved))), [columns, draft, saved]);

  const setDraftValue = useCallback((key: string, value: boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setAll = useCallback((value: boolean) => {
    setDraft((prev) => {
      const next = { ...prev };
      columns.forEach((col) => {
        if (!col.locked) next[col.key] = value;
      });
      return next;
    });
  }, [columns]);

  const resetToDefault = useCallback(() => {
    setDraft(mergeVisibility(columns, {}));
  }, [columns]);

  const save = useCallback(async (): Promise<boolean> => {
    const delta = computeDelta(columns, draft);
    try {
      setSaving(true);
      await preferencesApi.save(scope, delta);
      cache.set(scope, delta);
      setSaved(delta);
      notifyCacheChange();
      toast.success('Đã lưu cấu hình cột');
      return true;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Không thể lưu cấu hình cột');
      return false;
    } finally {
      setSaving(false);
    }
  }, [columns, draft, scope]);

  return {
    loading,
    saving,
    visible,
    draft,
    dirty,
    columns,
    setDraftValue,
    setAll,
    resetToDefault,
    save,
  };
};
