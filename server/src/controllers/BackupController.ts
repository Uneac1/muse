import { Context } from 'koa';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { config } from '../config';
import db, { replaceDatabaseFile } from '../database';
import { success, fail } from '../utils/response';

const MAX_RESTORE_BYTES = 512 * 1024 * 1024;

class RestoreValidationError extends Error {}

function validateSqliteSnapshot(filePath: string) {
  const snapshotDb = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const result = snapshotDb.pragma('integrity_check', { simple: true });
    if (result !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${String(result)}`);
    }
  } finally {
    snapshotDb.close();
  }
}

async function writeRequestBodyToFile(ctx: Context, filePath: string) {
  const contentLength = Number(ctx.get('content-length') || 0);
  if (contentLength > MAX_RESTORE_BYTES) {
    throw new RestoreValidationError('Backup file is too large');
  }

  let bytes = 0;
  const limitStream = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_RESTORE_BYTES) {
        callback(new RestoreValidationError('Backup file is too large'));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(ctx.req, limitStream, fs.createWriteStream(filePath, { flags: 'wx' }));
}

function writeBase64ToFile(fileContent: string, filePath: string) {
  const buffer = Buffer.from(fileContent, 'base64');
  const magic = buffer.toString('utf8', 0, 15);
  if (!magic.startsWith('SQLite format 3')) {
    throw new RestoreValidationError('Invalid SQLite database file');
  }
  if (buffer.byteLength > MAX_RESTORE_BYTES) {
    throw new RestoreValidationError('Backup file is too large');
  }
  fs.writeFileSync(filePath, buffer, { flag: 'wx' });
}

export class BackupController {
  async download(ctx: Context) {
    if (!fs.existsSync(config.dbPath)) {
      return fail(ctx, 'Database file not found', 404);
    }

    const snapshotPath = path.join(os.tmpdir(), `muse-backup-${Date.now()}.db`);

    try {
      await db.backup(snapshotPath);
      validateSqliteSnapshot(snapshotPath);
    } catch (err: any) {
      if (fs.existsSync(snapshotPath)) {
        fs.rmSync(snapshotPath, { force: true });
      }
      return fail(ctx, `Failed to prepare backup snapshot: ${err.message}`, 500);
    }

    const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    ctx.set('Content-Type', 'application/octet-stream');
    ctx.set('Content-Disposition', `attachment; filename="${fileName}"`);
    const stream = fs.createReadStream(snapshotPath);
    const cleanup = () => {
      if (fs.existsSync(snapshotPath)) {
        fs.rmSync(snapshotPath, { force: true });
      }
    };
    stream.on('close', cleanup);
    stream.on('error', cleanup);
    ctx.body = stream;
  }

  async restore(ctx: Context) {
    const body = ctx.request.body as any;
    let uploadedDbPath = '';

    const isStreamUpload = ctx.is('application/octet-stream');
    if (!isStreamUpload && !body?.fileContent) {
      return fail(ctx, 'fileContent is required', 400);
    }

    try {
      uploadedDbPath = path.join(os.tmpdir(), `muse-restore-${Date.now()}.db`);

      if (isStreamUpload) {
        await writeRequestBodyToFile(ctx, uploadedDbPath);
      } else {
        writeBase64ToFile(String(body.fileContent), uploadedDbPath);
      }

      try {
        validateSqliteSnapshot(uploadedDbPath);
      } catch (err: any) {
        fs.rmSync(uploadedDbPath, { force: true });
        return fail(ctx, `Invalid SQLite database file: ${err.message}`, 400);
      }

      // Backup current database
      const backupPath = `${config.dbPath}.backup-${Date.now()}`;
      if (fs.existsSync(config.dbPath)) {
        await db.backup(backupPath);
      }

      // Flush WAL before replacing the live database file.
      db.pragma('wal_checkpoint(TRUNCATE)');
      replaceDatabaseFile(uploadedDbPath);
      fs.rmSync(uploadedDbPath, { force: true });

      success(ctx, {
        message: 'Database restored successfully',
        backup: backupPath
      });
    } catch (err: any) {
      if (uploadedDbPath && fs.existsSync(uploadedDbPath)) {
        fs.rmSync(uploadedDbPath, { force: true });
      }
      if (err instanceof RestoreValidationError) {
        return fail(ctx, err.message, 400);
      }
      return fail(ctx, `Restore failed: ${err.message}`, 500);
    }
  }
}
