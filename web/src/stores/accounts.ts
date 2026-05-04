import { create } from 'zustand';
import type { Account, PaginatedResponse, ImportRequest, ImportResult, ExportRequest } from '../types';
import { accountApi } from '../lib/api';
import { isCacheFresh, readCache, writeCache } from '../lib/localCache';

interface AccountStore {
  accounts: Account[];
  loading: boolean;
  selectedIds: number[];
  searchQuery: string;
  pagination: { page: number; pageSize: number; total: number };
  fetchAccounts: (options?: { silent?: boolean; force?: boolean }) => Promise<void>;
  refreshAccountsSilent: () => Promise<void>;
  createAccount: (data: Partial<Account>) => Promise<void>;
  updateAccount: (id: number, data: Partial<Account>) => Promise<void>;
  deleteAccount: (id: number) => Promise<void>;
  batchDelete: (ids: number[]) => Promise<void>;
  importAccounts: (req: ImportRequest) => Promise<ImportResult>;
  exportAccounts: (req: ExportRequest) => Promise<string>;
  setSelectedIds: (ids: number[]) => void;
  setSearchQuery: (q: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

const ACCOUNT_CACHE_KEY = 'muse.accounts.cache';
const ACCOUNT_CACHE_MAX_AGE_MS = 90 * 1000;
const accountCacheEntry = readCache<{
  accounts: Account[];
  pagination: { page: number; pageSize: number; total: number };
  searchQuery: string;
}>(ACCOUNT_CACHE_KEY);
const accountCache = accountCacheEntry?.value;

export const useAccountStore = create<AccountStore>((set, get) => ({
  accounts: accountCache?.accounts || [],
  loading: false,
  selectedIds: [],
  searchQuery: accountCache?.searchQuery || '',
  pagination: accountCache?.pagination || { page: 1, pageSize: 20, total: 0 },

  fetchAccounts: async (options) => {
    const { page, pageSize } = get().pagination;
    const currentSearch = get().searchQuery;
    const canHydrateFromCache = !options?.force
      && !!accountCacheEntry
      && isCacheFresh(accountCacheEntry.updatedAt, ACCOUNT_CACHE_MAX_AGE_MS)
      && accountCacheEntry.value.pagination.page === page
      && accountCacheEntry.value.pagination.pageSize === pageSize
      && accountCacheEntry.value.searchQuery === currentSearch;

    if (canHydrateFromCache && get().accounts.length > 0) {
      return;
    }

    const shouldShowLoading = !options?.silent && get().accounts.length === 0;
    if (shouldShowLoading) {
      set({ loading: true });
    }
    try {
      const data = await accountApi.list({ page, pageSize, search: currentSearch });
      const nextState = {
        accounts: data.list,
        pagination: { page: data.page, pageSize: data.pageSize, total: data.total },
      };
      set(nextState);
      writeCache(ACCOUNT_CACHE_KEY, {
        ...nextState,
        searchQuery: currentSearch,
      });
    } finally {
      if (shouldShowLoading) {
        set({ loading: false });
      }
    }
  },

  refreshAccountsSilent: async () => {
    try {
      const { page, pageSize } = get().pagination;
      const data = await accountApi.list({ page, pageSize, search: get().searchQuery });
      set(state => {
        const accounts = state.accounts.map(acc => {
          const fresh = data.list.find(a => a.id === acc.id);
          return fresh ?? acc;
        });
        writeCache(ACCOUNT_CACHE_KEY, {
          accounts,
          pagination: state.pagination,
          searchQuery: state.searchQuery,
        });
        return { accounts };
      });
    } catch {
      // 静默失败，不影响用户操作
    }
  },

  createAccount: async (data) => {
    await accountApi.create(data);
    await get().fetchAccounts();
  },

  updateAccount: async (id, data) => {
    const updated = await accountApi.update(id, data);
    set(state => {
      const accounts = state.accounts.map(acc => acc.id === id ? updated : acc);
      writeCache(ACCOUNT_CACHE_KEY, {
        accounts,
        pagination: state.pagination,
        searchQuery: state.searchQuery,
      });
      return { accounts };
    });
  },

  deleteAccount: async (id) => {
    await accountApi.delete(id);
    await get().fetchAccounts();
  },

  batchDelete: async (ids) => {
    await accountApi.batchDelete(ids);
    set({ selectedIds: [] });
    await get().fetchAccounts();
  },

  importAccounts: async (req) => {
    const result = await accountApi.import(req);
    await get().fetchAccounts();
    return result;
  },

  exportAccounts: async (req) => {
    const result = await accountApi.export(req);
    return result.content;
  },

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setSearchQuery: (q) => {
    set(s => ({ searchQuery: q, pagination: { ...s.pagination, page: 1 } }));
    get().fetchAccounts({ silent: true });
  },
  setPage: (page) => { set(s => ({ pagination: { ...s.pagination, page } })); get().fetchAccounts({ silent: true }); },
  setPageSize: (size) => { set(s => ({ pagination: { ...s.pagination, pageSize: size, page: 1 } })); get().fetchAccounts({ silent: true }); },
}));
