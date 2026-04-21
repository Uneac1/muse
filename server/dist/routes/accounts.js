"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const AccountController_1 = require("../controllers/AccountController");
exports.accountRoutes = new koa_router_1.default();
const ctrl = new AccountController_1.AccountController();
exports.accountRoutes.get('/', ctrl.list);
exports.accountRoutes.post('/', ctrl.create);
exports.accountRoutes.put('/:id', ctrl.update);
exports.accountRoutes.delete('/:id', ctrl.delete);
exports.accountRoutes.post('/batch-delete', ctrl.batchDelete);
exports.accountRoutes.post('/import', ctrl.import);
exports.accountRoutes.post('/import-preview', ctrl.importPreview);
exports.accountRoutes.post('/import-confirm', ctrl.importConfirm);
exports.accountRoutes.post('/export', ctrl.export);
exports.accountRoutes.post('/:id/tags', ctrl.setTags);
//# sourceMappingURL=accounts.js.map