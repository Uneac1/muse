import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Play, RefreshCw, Square, TerminalSquare } from 'lucide-react';
import { toast } from 'sonner';
import { ControlPage, ControlPanel, KeyValueGrid, MetricCard } from '../components/layout/ControlCenter';
import { Button, StatusTag, Surface, toneTextClass } from '../components/ui/primitives';
import { openTeamsApi } from '../lib/api';
import type { OpenTeamsStatus } from '../types';

function dependencyTone(value: string) {
  return value === 'ready' ? 'success' : 'warning';
}

function statusTone(status?: OpenTeamsStatus['status']) {
  if (status === 'running') return 'success';
  if (status === 'starting') return 'primary';
  if (status === 'error') return 'danger';
  return 'neutral';
}

function metricTone(tone: ReturnType<typeof statusTone>) {
  return tone === 'neutral' ? 'default' : tone;
}

export default function OpenTeams() {
  const [status, setStatus] = useState<OpenTeamsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'start' | 'stop' | 'refresh' | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setBusy((current) => current || 'refresh');
    try {
      setStatus(await openTeamsApi.status());
    } catch (error: any) {
      toast.error(error.message || '加载 OpenTeams 状态失败');
    } finally {
      setBusy(null);
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!status || !['starting', 'running'].includes(status.status)) return undefined;
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load, status]);

  const dependencies = useMemo(() => Object.entries(status?.dependencies || {}), [status]);
  const readyCount = dependencies.filter(([, value]) => value === 'ready').length;

  const start = async () => {
    setBusy('start');
    try {
      setStatus(await openTeamsApi.start());
      toast.success('OpenTeams 启动中');
    } catch (error: any) {
      toast.error(error.message || 'OpenTeams 启动失败');
    } finally {
      setBusy(null);
    }
  };

  const stop = async () => {
    setBusy('stop');
    try {
      setStatus(await openTeamsApi.stop());
      toast.success('OpenTeams 已停止');
    } catch (error: any) {
      toast.error(error.message || 'OpenTeams 停止失败');
    } finally {
      setBusy(null);
    }
  };

  if (loading || !status) {
    return (
      <ControlPage>
        <div className="h-32 animate-pulse rounded-[28px] bg-[color:var(--surface-container-low)]" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[24px] bg-[color:var(--surface-container-low)]" />
          ))}
        </div>
      </ControlPage>
    );
  }

  return (
    <ControlPage>
      <section className="control-hero control-hero-blue">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="control-hero-badge">
              <TerminalSquare className="h-3.5 w-3.5" />
              OpenTeams
            </div>
            <h1 className="mt-3 text-3xl text-foreground">OpenTeams 工作台</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--on-primary-container)]">
              管理本地 OpenTeams 源码模块、前端开发服务和后端服务状态。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => load()} disabled={!!busy}>
              <RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button onClick={start} disabled={!!busy || status.status === 'running'} variant="primary">
              <Play className="h-4 w-4" />
              启动
            </Button>
            <Button onClick={stop} disabled={!!busy || status.status === 'stopped'} variant="quiet">
              <Square className="h-4 w-4" />
              停止
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="运行状态"
          value={<span className={toneTextClass(statusTone(status.status))}>{status.status}</span>}
          meta={status.updatedAt ? new Date(status.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '尚未记录'}
          tone={metricTone(statusTone(status.status))}
        />
        <MetricCard
          label="依赖就绪"
          value={`${readyCount}/${dependencies.length}`}
          meta="source / node_modules / corepack / cargo"
          tone={readyCount === dependencies.length ? 'success' : 'warning'}
        />
        <MetricCard
          label="服务端口"
          value={`${status.frontendPort} / ${status.backendPort}`}
          meta={status.frontendReady && status.backendReady ? '前后端均可连接' : '等待服务就绪'}
          tone={status.frontendReady && status.backendReady ? 'success' : 'default'}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <ControlPanel title="本地服务" eyebrow="Local">
          <KeyValueGrid
            columns={2}
            items={[
              { label: '前端地址', value: status.frontendReady ? <a className="text-primary" href={status.frontendUrl} target="_blank" rel="noreferrer">{status.frontendUrl}</a> : status.frontendUrl },
              { label: '后端地址', value: status.backendUrl },
              { label: '前端 PID', value: status.frontendPid || '未运行' },
              { label: '后端 PID', value: status.backendPid || '未运行' },
            ]}
          />
          {status.frontendReady ? (
            <Button
              variant="filled"
              className="mt-4 w-fit"
              onClick={() => window.open(status.frontendUrl, '_blank', 'noopener,noreferrer')}
            >
              打开 OpenTeams
              <ExternalLink className="h-4 w-4" />
            </Button>
          ) : null}
        </ControlPanel>

        <ControlPanel title="依赖状态" eyebrow="Preflight">
          <div className="grid gap-2">
            {dependencies.map(([name, value]) => (
              <Surface key={name} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm font-medium text-foreground">{name}</span>
                <StatusTag tone={dependencyTone(value)}>{value}</StatusTag>
              </Surface>
            ))}
          </div>
        </ControlPanel>
      </section>

      <ControlPanel title="命令" eyebrow="Local">
        <KeyValueGrid
          columns={3}
          items={[
            { label: '安装', value: <code>{status.commands.install}</code> },
            { label: '准备', value: <code>{status.commands.prepare}</code> },
            { label: '开发', value: <code>{status.commands.dev}</code> },
          ]}
        />
        {status.lastError ? (
          <Surface tone="danger" selected className="mt-4">
            <div className="text-sm font-semibold">最近错误</div>
            <pre className="mt-2 whitespace-pre-wrap text-xs leading-5">{status.lastError}</pre>
          </Surface>
        ) : null}
      </ControlPanel>
    </ControlPage>
  );
}
