import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  clearQueryCache,
  getInflightPromise,
  getQueryCacheEntry,
  invalidateQueries,
  isAbortError,
  serializeQueryKey,
  setInflightPromise,
  setQueryCacheEntry,
  subscribeQueryCache,
} from '../lib/queryCache';

export { invalidateQueries, clearQueryCache, isAbortError };

export interface UseQueryOptions<T> {
  queryKey: ReadonlyArray<unknown>;
  queryFn: (signal: AbortSignal) => Promise<T>;
  staleTime?: number;
  keepPreviousData?: boolean;
  enabled?: boolean;
  onError?: (err: any) => void;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: any;
  refetch: (force?: boolean) => Promise<T | undefined>;
  mutateData: (updater: T | ((prev: T | undefined) => T)) => void;
}

export function useQuery<T>({
  queryKey,
  queryFn,
  staleTime = 30 * 1000,
  keepPreviousData = true,
  enabled = true,
  onError,
}: UseQueryOptions<T>): UseQueryResult<T> {
  const { user } = useAuth();
  const userKey = user ? `${user.id}:${(user.roles || []).join(',')}` : 'anon';

  const serializedKey = useMemo(
    () => serializeQueryKey([queryKey[0], userKey, ...queryKey.slice(1)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userKey, JSON.stringify(queryKey)]
  );

  const initialCached = getQueryCacheEntry<T>(serializedKey);
  const [data, setData] = useState<T | undefined>(() => initialCached?.data);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);

  const prevDataRef = useRef<T | undefined>(initialCached?.data);
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const executeFetch = useCallback(
    async (force = false): Promise<T | undefined> => {
      if (!enabled) return data;

      const cached = getQueryCacheEntry<T>(serializedKey);
      const now = Date.now();

      if (cached) {
        prevDataRef.current = cached.data;
        if (mountedRef.current) {
          setData(cached.data);
        }
        if (!force && now - cached.updatedAt < staleTime) {
          if (mountedRef.current) {
            setIsFetching(false);
          }
          return cached.data;
        }
      } else if (!keepPreviousData && mountedRef.current) {
        setData(undefined);
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      if (mountedRef.current) {
        setIsFetching(true);
        setError(null);
      }

      try {
        let promise = !force ? getInflightPromise<T>(serializedKey) : undefined;
        if (!promise) {
          promise = queryFnRef.current(controller.signal);
          setInflightPromise(serializedKey, promise);
        }

        const result = await promise;
        if (controller.signal.aborted) {
          return prevDataRef.current;
        }

        setQueryCacheEntry(serializedKey, result);
        prevDataRef.current = result;

        if (mountedRef.current) {
          setData(result);
          setError(null);
        }
        return result;
      } catch (err: any) {
        if (controller.signal.aborted || isAbortError(err)) {
          return prevDataRef.current;
        }
        if (mountedRef.current) {
          setError(err);
          onErrorRef.current?.(err);
        }
        return prevDataRef.current;
      } finally {
        if (mountedRef.current && abortRef.current === controller) {
          setIsFetching(false);
        }
      }
    },
    [enabled, serializedKey, staleTime, keepPreviousData, data]
  );

  useEffect(() => {
    executeFetch(false);
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedKey, enabled]);

  useEffect(() => {
    return subscribeQueryCache(() => {
      const cached = getQueryCacheEntry<T>(serializedKey);
      if (!cached && enabled) {
        executeFetch(true);
      } else if (cached && mountedRef.current) {
        prevDataRef.current = cached.data;
        setData(cached.data);
      }
    });
  }, [serializedKey, enabled, executeFetch]);

  const mutateData = useCallback(
    (updater: T | ((prev: T | undefined) => T)) => {
      setData((prev) => {
        const next = typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater;
        prevDataRef.current = next;
        setQueryCacheEntry(serializedKey, next);
        return next;
      });
    },
    [serializedKey]
  );

  const effectiveData = data !== undefined ? data : keepPreviousData ? prevDataRef.current : undefined;
  const isLoading = isFetching && effectiveData === undefined;

  return {
    data: effectiveData,
    isLoading,
    isFetching,
    error,
    refetch: (force = true) => executeFetch(force),
    mutateData,
  };
}
