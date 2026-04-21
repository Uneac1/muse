export interface CacheEnvelope<T> {
  value: T;
  updatedAt: number;
}

export interface CacheState<T> {
  value: T | null;
  updatedAt: number | null;
  isStale: boolean;
}

function isBrowserReady() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readCache<T>(key: string): CacheEnvelope<T> | null {
  if (!isBrowserReady()) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readCacheState<T>(key: string, maxAgeMs?: number): CacheState<T> {
  const envelope = readCache<T>(key);
  if (!envelope) {
    return {
      value: null,
      updatedAt: null,
      isStale: true,
    };
  }

  return {
    value: envelope.value,
    updatedAt: envelope.updatedAt,
    isStale: typeof maxAgeMs === 'number' ? Date.now() - envelope.updatedAt > maxAgeMs : false,
  };
}

export function isCacheFresh(updatedAt: number | null | undefined, maxAgeMs: number) {
  if (!updatedAt) return false;
  return Date.now() - updatedAt <= maxAgeMs;
}

export function writeCache<T>(key: string, value: T) {
  if (!isBrowserReady()) return;

  try {
    const payload: CacheEnvelope<T> = {
      value,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // 缓存写入失败不应影响主流程
  }
}

export function removeCache(key: string) {
  if (!isBrowserReady()) return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // 缓存删除失败不应影响主流程
  }
}
