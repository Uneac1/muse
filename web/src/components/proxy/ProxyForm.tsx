import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { Proxy } from '../../types';
import type { MiSubIntegrationData } from '../../types';
import { integrationApi } from '../../lib/api';

interface Props {
  open: boolean;
  proxy: Proxy | null;
  onClose: () => void;
  onSave: (data: Partial<Proxy>) => Promise<void>;
}

const initialForm = { name: '', type: 'socks5' as 'socks5' | 'http', host: '', port: 1080, username: '', password: '', is_default: false };

type SourceMode = 'manual' | 'misub';

function normalizeBaseUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return (/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).replace(/\/+$/, '');
}

function parseProxyEndpoint(value: string) {
  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    if (!['http:', 'https:', 'socks:', 'socks5:'].includes(protocol)) return null;

    return {
      type: protocol === 'http:' || protocol === 'https:' ? 'http' as const : 'socks5' as const,
      host: url.hostname,
      port: Number(url.port || (protocol === 'http:' || protocol === 'https:' ? 80 : 1080)),
      username: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
    };
  } catch {
    return null;
  }
}

export default function ProxyForm({ open, proxy, onClose, onSave }: Props) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>('manual');
  const [miSubLoading, setMiSubLoading] = useState(false);
  const [miSubData, setMiSubData] = useState<MiSubIntegrationData | null>(null);
  const [selectedMiSubEntry, setSelectedMiSubEntry] = useState('');

  useEffect(() => {
    if (proxy) {
      setForm({
        name: proxy.name,
        type: proxy.type,
        host: proxy.host,
        port: proxy.port,
        username: proxy.username || '',
        password: proxy.password || '',
        is_default: proxy.is_default,
      });
    } else {
      setForm(initialForm);
    }
    setSourceMode('manual');
    setSelectedMiSubEntry('');
  }, [proxy, open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setMiSubLoading(true);
    integrationApi.getMiSub()
      .then((data) => {
        if (!cancelled) {
          setMiSubData(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMiSubData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMiSubLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const miSubEntries = useMemo(() => {
    if (!miSubData?.connected) return [];
    const root = normalizeBaseUrl(miSubData.baseUrl);
    const profileToken = miSubData.settings?.profileToken || '';
    const profileEntries = (miSubData.profiles || []).map((profile) => ({
      key: `profile:${profile.id}`,
      label: `分组 · ${profile.name}`,
      url: profileToken ? `${root}/${profileToken}/${profile.customId || profile.id}` : '',
    })).filter((item) => item.url);

    const subscriptionEntries = (miSubData.misubs || []).map((item) => ({
      key: `subscription:${item.id}`,
      label: `订阅 · ${item.name}`,
      url: item.url,
    })).filter((item) => item.url);

    return [...profileEntries, ...subscriptionEntries];
  }, [miSubData]);

  const selectedEntry = miSubEntries.find((item) => item.key === selectedMiSubEntry);

  const importFromMiSub = () => {
    if (!selectedEntry) {
      toast.error('先选择一个订阅或分组链接');
      return;
    }

    const parsed = parseProxyEndpoint(selectedEntry.url);
    if (parsed) {
      setForm((current) => ({
        ...current,
        name: current.name || selectedEntry.label,
        type: parsed.type,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
      }));
      toast.success('已从订阅管理导入代理地址');
      return;
    }

    setForm((current) => ({
      ...current,
      name: current.name || selectedEntry.label,
      type: 'socks5',
      host: current.host || '127.0.0.1',
      port: current.port || 7890,
    }));
    toast.success('检测到这是订阅链接，已按本地代理客户端模式预填，可继续改成你的实际端口');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
          {proxy ? '编辑代理' : '添加代理'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>来源</label>
            <div className="flex gap-4 mt-1">
              {([
                ['manual', '手动输入'],
                ['misub', '订阅管理'],
              ] as const).map(([mode, label]) => (
                <label key={mode} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sourceMode"
                    checked={sourceMode === mode}
                    onChange={() => setSourceMode(mode)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {sourceMode === 'misub' && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">从订阅管理导入</div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    支持直接读取 MiSub 的订阅和分组链接。若链接本身不是 HTTP / SOCKS 代理地址，会自动按本地代理客户端模式预填。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={importFromMiSub}
                  disabled={!selectedEntry}
                  className="px-3 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  导入
                </button>
              </div>

              {miSubLoading ? (
                <div className="text-sm text-zinc-500 dark:text-zinc-400">正在读取订阅管理...</div>
              ) : !miSubData?.connected ? (
                <div className="text-sm text-zinc-500 dark:text-zinc-400">MiSub 尚未连接，先去订阅管理页面连接后再回来导入。</div>
              ) : miSubEntries.length === 0 ? (
                <div className="text-sm text-zinc-500 dark:text-zinc-400">MiSub 已连接，但当前没有可导入的订阅或分组链接。</div>
              ) : (
                <>
                  <select
                    value={selectedMiSubEntry}
                    onChange={(e) => setSelectedMiSubEntry(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">选择订阅或分组链接</option>
                    {miSubEntries.map((entry) => (
                      <option key={entry.key} value={entry.key}>{entry.label}</option>
                    ))}
                  </select>
                  {selectedEntry && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 break-all">
                      当前链接：{selectedEntry.url}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label className={labelCls}>名称</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="我的代理" />
          </div>
          <div>
            <label className={labelCls}>类型</label>
            <div className="flex gap-4 mt-1">
              {(['socks5', 'http'] as const).map(t => (
                <label key={t} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="proxyType"
                    checked={form.type === t}
                    onChange={() => setForm(f => ({ ...f, type: t }))}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 uppercase">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>主机</label>
              <input type="text" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} className={inputCls} placeholder="127.0.0.1" />
            </div>
            <div>
              <label className={labelCls}>端口</label>
              <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))} className={inputCls} placeholder="1080" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>用户名 <span className="text-zinc-400 font-normal">(可选)</span></label>
              <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className={inputCls} placeholder="用户名" />
            </div>
            <div>
              <label className={labelCls}>密码 <span className="text-zinc-400 font-normal">(可选)</span></label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputCls} placeholder="密码" />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
            <div
              role="switch"
              aria-checked={form.is_default}
              tabIndex={0}
              onClick={() => setForm(f => ({ ...f, is_default: !f.is_default }))}
              onKeyDown={e => e.key === 'Enter' && setForm(f => ({ ...f, is_default: !f.is_default }))}
              className={`relative w-9 h-5 rounded-full transition-colors ${form.is_default ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_default ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">设为默认代理</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            取消
          </button>
          <button onClick={handleSave} disabled={saving || !form.name || !form.host || !form.port} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
