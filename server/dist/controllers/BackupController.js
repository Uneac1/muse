"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupController = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const response_1 = require("../utils/response");
const DB_PATH = path_1.default.join(__dirname, '../../data/database.db');
class BackupController {
    async download(ctx) {
        if (!fs_1.default.existsSync(DB_PATH)) {
            return (0, response_1.fail)(ctx, 'Database file not found', 404);
        }
        const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
        ctx.set('Content-Type', 'application/octet-stream');
        ctx.set('Content-Disposition', `attachment; filename="${fileName}"`);
        ctx.body = fs_1.default.createReadStream(DB_PATH);
    }
    async restore(ctx) {
        const body = ctx.request.body;
        if (!body.fileContent) {
            return (0, response_1.fail)(ctx, 'fileContent is required', 400);
        }
        try {
            // Decode base64 content
            const buffer = Buffer.from(body.fileContent, 'base64');
            // Validate it's a SQLite database (magic number check)
            const magic = buffer.toString('utf8', 0, 15);
            if (!magic.startsWith('SQLite format 3')) {
                return (0, response_1.fail)(ctx, 'Invalid SQLite database file', 400);
            }
            // Backup current database
            const backupPath = `${DB_PATH}.backup-${Date.now()}`;
            if (fs_1.default.existsSync(DB_PATH)) {
                fs_1.default.copyFileSync(DB_PATH, backupPath);
            }
            // Write new database
            fs_1.default.writeFileSync(DB_PATH, buffer);
            (0, response_1.success)(ctx, {
                message: 'Database restored successfully',
                backup: backupPath
            });
        }
        catch (err) {
            return (0, response_1.fail)(ctx, `Restore failed: ${err.message}`, 500);
        }
    }
}
exports.BackupController = BackupController;
//# sourceMappingURL=BackupController.js.map