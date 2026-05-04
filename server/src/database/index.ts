import Database, { Database as DatabaseType } from 'better-sqlite3';
import { config } from '../config';
import path from 'path';
import fs from 'fs';

const dir = path.dirname(config.dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

function openDatabase(dbPath: string): DatabaseType {
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  return database;
}

function removeSqliteSidecars(dbPath: string) {
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecarPath)) {
      fs.rmSync(sidecarPath, { force: true });
    }
  }
}

let currentDb: DatabaseType = openDatabase(config.dbPath);

export function closeDatabase(): void {
  if (currentDb.open) {
    currentDb.close();
  }
}

export function reopenDatabase(): void {
  closeDatabase();
  currentDb = openDatabase(config.dbPath);
}

export function replaceDatabaseFile(sourcePath: string): void {
  closeDatabase();
  try {
    removeSqliteSidecars(config.dbPath);
    fs.copyFileSync(sourcePath, config.dbPath);
  } catch (error) {
    currentDb = openDatabase(config.dbPath);
    throw error;
  }

  currentDb = openDatabase(config.dbPath);
}

const db = new Proxy({} as DatabaseType, {
  get(_target, prop) {
    const value = (currentDb as any)[prop];
    return typeof value === 'function' ? value.bind(currentDb) : value;
  },
}) as DatabaseType;

export default db;
