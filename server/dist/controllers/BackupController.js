"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupController = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const stream_1 = require("stream");
const promises_1 = require("stream/promises");
const config_1 = require("../config");
const database_1 = __importStar(require("../database"));
const response_1 = require("../utils/response");
const MAX_RESTORE_BYTES = 512 * 1024 * 1024;
class RestoreValidationError extends Error {
}
function validateSqliteSnapshot(filePath) {
    const snapshotDb = new better_sqlite3_1.default(filePath, { readonly: true, fileMustExist: true });
    try {
        const result = snapshotDb.pragma('integrity_check', { simple: true });
        if (result !== 'ok') {
            throw new Error(`SQLite integrity check failed: ${String(result)}`);
        }
    }
    finally {
        snapshotDb.close();
    }
}
async function writeRequestBodyToFile(ctx, filePath) {
    const contentLength = Number(ctx.get('content-length') || 0);
    if (contentLength > MAX_RESTORE_BYTES) {
        throw new RestoreValidationError('Backup file is too large');
    }
    let bytes = 0;
    const limitStream = new stream_1.Transform({
        transform(chunk, _encoding, callback) {
            bytes += Buffer.byteLength(chunk);
            if (bytes > MAX_RESTORE_BYTES) {
                callback(new RestoreValidationError('Backup file is too large'));
                return;
            }
            callback(null, chunk);
        },
    });
    await (0, promises_1.pipeline)(ctx.req, limitStream, fs_1.default.createWriteStream(filePath, { flags: 'wx' }));
}
function writeBase64ToFile(fileContent, filePath) {
    const buffer = Buffer.from(fileContent, 'base64');
    const magic = buffer.toString('utf8', 0, 15);
    if (!magic.startsWith('SQLite format 3')) {
        throw new RestoreValidationError('Invalid SQLite database file');
    }
    if (buffer.byteLength > MAX_RESTORE_BYTES) {
        throw new RestoreValidationError('Backup file is too large');
    }
    fs_1.default.writeFileSync(filePath, buffer, { flag: 'wx' });
}
class BackupController {
    async download(ctx) {
        if (!fs_1.default.existsSync(config_1.config.dbPath)) {
            return (0, response_1.fail)(ctx, 'Database file not found', 404);
        }
        const snapshotPath = path_1.default.join(os_1.default.tmpdir(), `muse-backup-${Date.now()}.db`);
        try {
            await database_1.default.backup(snapshotPath);
            validateSqliteSnapshot(snapshotPath);
        }
        catch (err) {
            if (fs_1.default.existsSync(snapshotPath)) {
                fs_1.default.rmSync(snapshotPath, { force: true });
            }
            return (0, response_1.fail)(ctx, `Failed to prepare backup snapshot: ${err.message}`, 500);
        }
        const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
        ctx.set('Content-Type', 'application/octet-stream');
        ctx.set('Content-Disposition', `attachment; filename="${fileName}"`);
        const stream = fs_1.default.createReadStream(snapshotPath);
        const cleanup = () => {
            if (fs_1.default.existsSync(snapshotPath)) {
                fs_1.default.rmSync(snapshotPath, { force: true });
            }
        };
        stream.on('close', cleanup);
        stream.on('error', cleanup);
        ctx.body = stream;
    }
    async restore(ctx) {
        const body = ctx.request.body;
        let uploadedDbPath = '';
        const isStreamUpload = ctx.is('application/octet-stream');
        if (!isStreamUpload && !body?.fileContent) {
            return (0, response_1.fail)(ctx, 'fileContent is required', 400);
        }
        try {
            uploadedDbPath = path_1.default.join(os_1.default.tmpdir(), `muse-restore-${Date.now()}.db`);
            if (isStreamUpload) {
                await writeRequestBodyToFile(ctx, uploadedDbPath);
            }
            else {
                writeBase64ToFile(String(body.fileContent), uploadedDbPath);
            }
            try {
                validateSqliteSnapshot(uploadedDbPath);
            }
            catch (err) {
                fs_1.default.rmSync(uploadedDbPath, { force: true });
                return (0, response_1.fail)(ctx, `Invalid SQLite database file: ${err.message}`, 400);
            }
            // Backup current database
            const backupPath = `${config_1.config.dbPath}.backup-${Date.now()}`;
            if (fs_1.default.existsSync(config_1.config.dbPath)) {
                await database_1.default.backup(backupPath);
            }
            // Flush WAL before replacing the live database file.
            database_1.default.pragma('wal_checkpoint(TRUNCATE)');
            (0, database_1.replaceDatabaseFile)(uploadedDbPath);
            fs_1.default.rmSync(uploadedDbPath, { force: true });
            (0, response_1.success)(ctx, {
                message: 'Database restored successfully',
                backup: backupPath
            });
        }
        catch (err) {
            if (uploadedDbPath && fs_1.default.existsSync(uploadedDbPath)) {
                fs_1.default.rmSync(uploadedDbPath, { force: true });
            }
            if (err instanceof RestoreValidationError) {
                return (0, response_1.fail)(ctx, err.message, 400);
            }
            return (0, response_1.fail)(ctx, `Restore failed: ${err.message}`, 500);
        }
    }
}
exports.BackupController = BackupController;
//# sourceMappingURL=BackupController.js.map