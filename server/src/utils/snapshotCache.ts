import fs from 'fs';
import path from 'path';

type SnapshotStore = Record<string, { updatedAt: number; value: unknown }>;

const snapshotPath = path.resolve(process.cwd(), 'data', 'integration-snapshots.json');

function readStore(): SnapshotStore {
  try {
    if (!fs.existsSync(snapshotPath)) return {};
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as SnapshotStore;
  } catch {
    return {};
  }
}

function writeStore(store: SnapshotStore) {
  try {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(store), 'utf8');
  } catch {
    // Snapshot persistence is an optimization. Never fail the request because of it.
  }
}

export function getSnapshot<T>(key: string, maxAgeMs: number): T | null {
  const entry = readStore()[key];
  if (!entry || Date.now() - entry.updatedAt > maxAgeMs) return null;
  return entry.value as T;
}

export function setSnapshot<T>(key: string, value: T) {
  const store = readStore();
  store[key] = { value, updatedAt: Date.now() };
  writeStore(store);
}

export function deleteSnapshot(key: string) {
  const store = readStore();
  delete store[key];
  writeStore(store);
}

export function deleteSnapshotsByPrefix(prefix: string) {
  const store = readStore();
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) delete store[key];
  }
  writeStore(store);
}
