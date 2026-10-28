export interface CacheEntry<T = any> {
  data: T;
  updatedAt: number;
}

const cacheStore = new Map<string, CacheEntry>();
const inflightStore = new Map<string, Promise<any>>();
const listeners = new Set<() => void>();

export function serializeQueryKey(key: ReadonlyArray<unknown> | string): string {
  if (typeof key === 'string') return key;
  return JSON.stringify(
    key.map((part) => {
      if (part && typeof part === 'object' && !Array.isArray(part)) {
        const sorted: Record<string, unknown> = {};
        Object.keys(part as Record<string, unknown>)
          .sort()
          .forEach((k) => {
            const val = (part as Record<string, unknown>)[k];
            if (val !== undefined) {
              sorted[k] = val;
            }
          });
        return sorted;
      }
      return part;
    })
  );
}

export function getQueryCacheEntry<T>(serializedKey: string): CacheEntry<T> | undefined {
  return cacheStore.get(serializedKey) as CacheEntry<T> | undefined;
}

export function setQueryCacheEntry<T>(serializedKey: string, data: T): void {
  cacheStore.set(serializedKey, { data, updatedAt: Date.now() });
}

export function getInflightPromise<T>(serializedKey: string): Promise<T> | undefined {
  return inflightStore.get(serializedKey) as Promise<T> | undefined;
}

export function setInflightPromise<T>(serializedKey: string, promise: Promise<T>): void {
  inflightStore.set(serializedKey, promise);
  promise.finally(() => {
    if (inflightStore.get(serializedKey) === promise) {
      inflightStore.delete(serializedKey);
    }
  });
}

export function subscribeQueryCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

export function invalidateQueries(prefix?: string | string[]): void {
  if (!prefix) {
    cacheStore.clear();
    inflightStore.clear();
    notifyListeners();
    return;
  }

  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  for (const key of Array.from(cacheStore.keys())) {
    const matched = prefixes.some(
      (p) => key === p || key.startsWith(`["${p}"`) || key.includes(`"${p}"`)
    );
    if (matched) {
      cacheStore.delete(key);
    }
  }
  for (const key of Array.from(inflightStore.keys())) {
    const matched = prefixes.some(
      (p) => key === p || key.startsWith(`["${p}"`) || key.includes(`"${p}"`)
    );
    if (matched) {
      inflightStore.delete(key);
    }
  }
  notifyListeners();
}

export function clearQueryCache(): void {
  cacheStore.clear();
  inflightStore.clear();
  notifyListeners();
}

export function isAbortError(err: any): boolean {
  if (!err) return false;
  return (
    err.name === 'CanceledError' ||
    err.name === 'AbortError' ||
    err.code === 'ERR_CANCELED' ||
    Boolean(err.__CANCEL__)
  );
}
