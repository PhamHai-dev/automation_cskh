import { useCallback, useEffect, useMemo, useState } from 'react';
import { preferencesApi } from '../api/preferences.api';
import {
  PreferenceScope,
  ProgramColumnFilter,
  ColumnMeta,
  COLUMNS_BY_SCOPE,
  mergeVisibility,
  computeDelta,
} from '../columns';
import { useToast } from '../../../components/ui/Toast';

export interface UseColumnVisibilityResult {
  loading: boolean;
  saving: boolean;
  /** Merged visibility map (default + saved + program filter + manual overrides) — use in table rendering */
  visible: Record<string, boolean>;
  /** Draft state (mutable in ColumnVisibilityDropdown / Settings UI) */
  draft: Record<string, boolean>;
  dirty: boolean;
  columns: ColumnMeta[];
  setDraftValue: (key: string, value: boolean) => void;
  setAll: (value: boolean) => void;
  resetToDefault: () => void;
  save: () => Promise<boolean>;
}

const cache = new Map<PreferenceScope, Record<string, boolean>>();
const overridesCache = new Map<string, Record<string, boolean>>();
const cacheListeners = new Set<() => void>();

const notifyCacheChange = () => cacheListeners.forEach((fn) => fn());

export const useColumnVisibility = (
  scope: PreferenceScope,
  programFilter: ProgramColumnFilter = 'ALL'
): UseColumnVisibilityResult => {
  const toast = useToast();
  const columns = COLUMNS_BY_SCOPE[scope] ?? [];
  const overrideCacheKey = `${scope}::${programFilter}`;

  const [loading, setLoading] = useState(!cache.has(scope));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>(cache.get(scope) ?? {});
  const [overrides, setOverrides] = useState<Record<string, boolean>>(
    overridesCache.get(overrideCacheKey) ?? {}
  );
  const [draft, setDraft] = useState<Record<string, boolean>>(
    mergeVisibility(
      columns,
      cache.get(scope) ?? {},
      programFilter,
      overridesCache.get(overrideCacheKey) ?? {}
    )
  );

  // Load once per scope (use cache to avoid re-fetch on tab switches)
  useEffect(() => {
    let cancelled = false;
    const currentOverrides = overridesCache.get(overrideCacheKey) ?? {};
    setOverrides(currentOverrides);

    if (cache.has(scope)) {
      const cached = cache.get(scope)!;
      setSaved(cached);
      setDraft(mergeVisibility(columns, cached, programFilter, currentOverrides));
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
        setDraft(mergeVisibility(columns, value, programFilter, currentOverrides));
      } catch {
        // Graceful fallback to defaults — do not block the page
        cache.set(scope, {});
        setSaved({});
        setDraft(mergeVisibility(columns, {}, programFilter, currentOverrides));
        toast.warning('Không tải được cấu hình cột cá nhân, dùng mặc định');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, programFilter]);

  // Refresh draft if cache changes from another instance (e.g. after Settings or dropdown toggle)
  useEffect(() => {
    const listener = () => {
      const cached = cache.get(scope) ?? {};
      const currentOverrides = overridesCache.get(overrideCacheKey) ?? {};
      setSaved(cached);
      setOverrides(currentOverrides);
      setDraft(mergeVisibility(columns, cached, programFilter, currentOverrides));
    };
    cacheListeners.add(listener);
    return () => {
      cacheListeners.delete(listener);
    };
  }, [columns, overrideCacheKey, programFilter, scope]);

  const visible = useMemo(
    () => mergeVisibility(columns, saved, programFilter, overrides),
    [columns, overrides, programFilter, saved]
  );
  const dirty = useMemo(
    () =>
      JSON.stringify(computeDelta(columns, draft)) !==
      JSON.stringify(computeDelta(columns, mergeVisibility(columns, saved))),
    [columns, draft, saved]
  );

  const setDraftValue = useCallback(
    (key: string, value: boolean) => {
      const nextOverrides = {
        ...(overridesCache.get(overrideCacheKey) ?? {}),
        [key]: value,
      };
      overridesCache.set(overrideCacheKey, nextOverrides);
      setOverrides(nextOverrides);
      setDraft((prev) => ({ ...prev, [key]: value }));
      notifyCacheChange();
    },
    [overrideCacheKey]
  );

  const setAll = useCallback(
    (value: boolean) => {
      const nextOverrides: Record<string, boolean> = {};
      columns.forEach((col) => {
        if (!col.locked) nextOverrides[col.key] = value;
      });
      overridesCache.set(overrideCacheKey, nextOverrides);
      setOverrides(nextOverrides);
      setDraft((prev) => {
        const next = { ...prev };
        columns.forEach((col) => {
          if (!col.locked) next[col.key] = value;
        });
        return next;
      });
      notifyCacheChange();
    },
    [columns, overrideCacheKey]
  );

  const resetToDefault = useCallback(() => {
    overridesCache.delete(overrideCacheKey);
    setOverrides({});
    setDraft(mergeVisibility(columns, {}, programFilter, {}));
    notifyCacheChange();
  }, [columns, overrideCacheKey, programFilter]);

  const save = useCallback(async (): Promise<boolean> => {
    const delta = computeDelta(columns, draft);
    try {
      setSaving(true);
      await preferencesApi.save(scope, delta);
      cache.set(scope, delta);
      overridesCache.delete(overrideCacheKey);
      setSaved(delta);
      setOverrides({});
      notifyCacheChange();
      toast.success('Đã lưu cấu hình cột');
      return true;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Không thể lưu cấu hình cột');
      return false;
    } finally {
      setSaving(false);
    }
  }, [columns, draft, overrideCacheKey, scope, toast]);

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
