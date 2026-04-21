import { create } from 'zustand';
import type { Tag } from '../types';
import { tagApi } from '../lib/api';
import { isCacheFresh, readCache, writeCache } from '../lib/localCache';

interface TagStore {
  tags: Tag[];
  fetchTags: () => Promise<void>;
  createTag: (name: string, color?: string) => Promise<Tag>;
  updateTag: (id: number, data: { name?: string; color?: string }) => Promise<void>;
  deleteTag: (id: number) => Promise<void>;
  setAccountTags: (accountId: number, tagIds: number[]) => Promise<void>;
}

export const useTagStore = create<TagStore>((set) => ({
  tags: readCache<Tag[]>('muse.tags.cache')?.value || [],

  fetchTags: async () => {
    const cacheEntry = readCache<Tag[]>('muse.tags.cache');
    if (cacheEntry && isCacheFresh(cacheEntry.updatedAt, 5 * 60 * 1000)) {
      set({ tags: cacheEntry.value });
      return;
    }
    const tags = await tagApi.list();
    set({ tags });
    writeCache('muse.tags.cache', tags);
  },

  createTag: async (name, color) => {
    const tag = await tagApi.create({ name, color });
    set(state => {
      const tags = [...state.tags, tag];
      writeCache('muse.tags.cache', tags);
      return { tags };
    });
    return tag;
  },

  updateTag: async (id, data) => {
    const tag = await tagApi.update(id, data);
    set(state => {
      const tags = state.tags.map(t => t.id === id ? tag : t);
      writeCache('muse.tags.cache', tags);
      return { tags };
    });
  },

  deleteTag: async (id) => {
    await tagApi.delete(id);
    set(state => {
      const tags = state.tags.filter(t => t.id !== id);
      writeCache('muse.tags.cache', tags);
      return { tags };
    });
  },

  setAccountTags: async (accountId, tagIds) => {
    await tagApi.setAccountTags(accountId, tagIds);
  },
}));
