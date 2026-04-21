import { readCacheState, writeCache } from './localCache';

export const INTEGRATION_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export function readIntegrationCache<T>(key: string, maxAgeMs = INTEGRATION_CACHE_MAX_AGE_MS) {
  return readCacheState<T>(key, maxAgeMs);
}

export function writeIntegrationCache<T>(key: string, value: T) {
  writeCache(key, value);
}

export function shouldShowInitialLoading<T>(cachedValue: T | null) {
  return !cachedValue;
}

export function isIntegrationCacheFresh<T>(key: string, maxAgeMs = INTEGRATION_CACHE_MAX_AGE_MS) {
  const state = readCacheState<T>(key, maxAgeMs);
  return !!state.value && !state.isStale;
}
