"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const BackupController_1 = require("../controllers/BackupController");
exports.backupRoutes = new koa_router_1.default();
const ctrl = new BackupController_1.BackupController();
exports.backupRoutes.get('/download', ctrl.download);
exports.backupRoutes.post('/restore', ctrl.restore);
//# sourceMappingURL=backup.js.map