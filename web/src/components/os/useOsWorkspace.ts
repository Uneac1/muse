import { useCallback, useEffect, useState } from 'react';
import { osApi } from '../../lib/api';
import { readCacheState, writeCache } from '../../lib/localCache';
import type { PersonalOsWorkspace } from '../../types';

const OS_WORKSPACE_CACHE_KEY = 'muse.os.workspace';
const OS_WORKSPACE_MAX_AGE_MS = 30 * 1000;

const cachedWorkspace = readCacheState<PersonalOsWorkspace>(OS_WORKSPACE_CACHE_KEY, OS_WORKSPACE_MAX_AGE_MS);
let workspaceMemory = cachedWorkspace.value;
let workspaceUpdatedAt = cachedWorkspace.updatedAt;
let inflightWorkspace: Promise<PersonalOsWorkspace> | null = null;

function isWorkspaceFresh() {
  return !!workspaceUpdatedAt && Date.now() - workspaceUpdatedAt <= OS_WORKSPACE_MAX_AGE_MS;
}

async function loadWorkspace(force = false) {
  if (!force && workspaceMemory && isWorkspaceFresh()) {
    return workspaceMemory;
  }

  if (!force && inflightWorkspace) {
    return inflightWorkspace;
  }

  inflightWorkspace = osApi.workspace()
    .then((workspace) => {
      workspaceMemory = workspace;
      workspaceUpdatedAt = Date.now();
      writeCache(OS_WORKSPACE_CACHE_KEY, workspace);
      return workspace;
    })
    .finally(() => {
      inflightWorkspace = null;
    });

  return inflightWorkspace;
}

export function useOsWorkspace() {
  const [data, setData] = useState<PersonalOsWorkspace | null>(workspaceMemory);
  const [loading, setLoading] = useState(!workspaceMemory);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = true) => {
    try {
      setLoading(!workspaceMemory);
      setError(null);
      setData(await loadWorkspace(force));
    } catch (err: any) {
      setError(err.message || '加载个人操作系统失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (workspaceMemory && isWorkspaceFresh()) {
      return () => {
        cancelled = true;
      };
    }

    setLoading(!workspaceMemory);
    loadWorkspace(false)
      .then((workspace) => {
        if (!cancelled) setData(workspace);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || '加载个人操作系统失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error, reload: () => refresh(true) };
}
