import { create } from 'zustand';
import type { Proxy, ProxyTestResult } from '../types';
import { proxyApi } from '../lib/api';
import { isCacheFresh, readCache, writeCache } from '../lib/localCache';

interface ProxyStore {
  proxies: Proxy[];
  loading: boolean;
  testResult: ProxyTestResult | null;
  fetchProxies: (options?: { silent?: boolean; force?: boolean }) => Promise<void>;
  createProxy: (data: Partial<Proxy>) => Promise<void>;
  updateProxy: (id: number, data: Partial<Proxy>) => Promise<void>;
  deleteProxy: (id: number) => Promise<void>;
  testProxy: (id: number) => Promise<ProxyTestResult>;
  setDefault: (id: number) => Promise<void>;
  setEnabled: (id: number, enabled: boolean) => Promise<void>;
}

const PROXY_CACHE_KEY = 'muse.proxies.cache';
const PROXY_CACHE_MAX_AGE_MS = 90 * 1000;
const proxyCacheEntry = readCache<Proxy[]>(PROXY_CACHE_KEY);

export const useProxyStore = create<ProxyStore>((set, get) => ({
  proxies: proxyCacheEntry?.value || [],
  loading: false,
  testResult: null,

  fetchProxies: async (options) => {
    if (!options?.force && proxyCacheEntry && isCacheFresh(proxyCacheEntry.updatedAt, PROXY_CACHE_MAX_AGE_MS) && get().proxies.length > 0) {
      return;
    }

    const shouldShowLoading = !options?.silent && get().proxies.length === 0;
    if (shouldShowLoading) {
      set({ loading: true });
    }
    try {
      const data = await proxyApi.list();
      set({ proxies: data });
      writeCache(PROXY_CACHE_KEY, data);
    } finally {
      if (shouldShowLoading) {
        set({ loading: false });
      }
    }
  },

  createProxy: async (data) => {
    await proxyApi.create(data);
    await get().fetchProxies();
  },

  updateProxy: async (id, data) => {
    await proxyApi.update(id, data);
    await get().fetchProxies();
  },

  deleteProxy: async (id) => {
    await proxyApi.delete(id);
    await get().fetchProxies();
  },

  testProxy: async (id) => {
    const result = await proxyApi.test(id);
    set({ testResult: result });
    await get().fetchProxies();
    return result;
  },

  setDefault: async (id) => {
    await proxyApi.setDefault(id);
    await get().fetchProxies();
  },

  setEnabled: async (id, enabled) => {
    await proxyApi.setEnabled(id, enabled);
    await get().fetchProxies();
  },
}));
