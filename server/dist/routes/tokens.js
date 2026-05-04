"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const TokenController_1 = require("../controllers/TokenController");
exports.tokenRoutes = new koa_router_1.default();
const ctrl = new TokenController_1.TokenController();
exports.tokenRoutes.get('/accounts', ctrl.listAccounts);
exports.tokenRoutes.post('/accounts', ctrl.createAccount);
exports.tokenRoutes.put('/accounts/:id', ctrl.updateAccount);
exports.tokenRoutes.delete('/accounts/:id', ctrl.deleteAccount);
exports.tokenRoutes.post('/accounts/:id/sync', ctrl.syncAccount);
exports.tokenRoutes.post('/sync', ctrl.syncAll);
exports.tokenRoutes.post('/auto-sync', ctrl.autoSync);
exports.tokenRoutes.post('/codex/free/import', ctrl.importCodexFree);
//# sourceMappingURL=tokens.js.map