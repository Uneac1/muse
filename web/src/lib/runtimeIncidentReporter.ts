import type { AgentIncidentReportInput } from '../types';

const INCIDENT_ENDPOINT = '/api/os/agent/incidents';
const INCIDENT_TTL_MS = 15000;
const recentIncidents = new Map<string, number>();
const inFlightIncidents = new Set<string>();

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function trimRecent(now: number) {
  recentIncidents.forEach((timestamp, key) => {
    if (now - timestamp > INCIDENT_TTL_MS) {
      recentIncidents.delete(key);
    }
  });
}

function clip(value: unknown, limit: number) {
  return String(value || '').trim().slice(0, Math.max(0, limit));
}

function normalizePayload(input: AgentIncidentReportInput) {
  const title = clip(input.title, 120) || '前端运行时异常';
  const detail = clip(input.detail, 4000) || '前端上报了空异常详情。';
  const source = clip(input.source, 120) || 'frontend.runtime';
  const kind = input.kind || 'runtime_probe';
  const fingerprint = clip(
    input.fingerprint || `frontend:${kind}:${hashText(`${title}|${detail.slice(0, 320)}|${source}`)}`,
    255,
  );

  return {
    ...input,
    title,
    detail,
    source,
    kind,
    fingerprint,
    metadata: {
      ...(input.metadata || {}),
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
      href: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    },
  };
}

export async function reportRuntimeIncident(input: AgentIncidentReportInput) {
  if (typeof window === 'undefined') return;

  const payload = normalizePayload(input);
  if (payload.detail.includes(INCIDENT_ENDPOINT) || payload.title.includes('Report agent incident failed')) return;

  const now = Date.now();
  trimRecent(now);
  const dedupeKey = payload.fingerprint || `${payload.kind}:${payload.title}`;
  const lastAt = recentIncidents.get(dedupeKey) || 0;
  if (now - lastAt < INCIDENT_TTL_MS || inFlightIncidents.has(dedupeKey)) return;

  recentIncidents.set(dedupeKey, now);
  inFlightIncidents.add(dedupeKey);

  try {
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    await fetch(INCIDENT_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  } finally {
    inFlightIncidents.delete(dedupeKey);
  }
}
