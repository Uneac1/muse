"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const AiController_1 = require("../controllers/AiController");
exports.aiRoutes = new koa_router_1.default();
const ctrl = new AiController_1.AiController();
exports.aiRoutes.get('/accounts', ctrl.listAccounts);
exports.aiRoutes.post('/accounts', ctrl.createAccount);
exports.aiRoutes.get('/accounts/:id', ctrl.getAccountDiagnostics);
exports.aiRoutes.post('/accounts/:id/test', ctrl.testAccount);
exports.aiRoutes.put('/accounts/:id', ctrl.updateAccount);
exports.aiRoutes.delete('/accounts/:id', ctrl.deleteAccount);
exports.aiRoutes.get('/threads', ctrl.listThreads);
exports.aiRoutes.get('/threads/:id/messages', ctrl.getMessages);
exports.aiRoutes.delete('/threads/:id', ctrl.deleteThread);
exports.aiRoutes.post('/accounts/:id/chat', ctrl.chat);
//# sourceMappingURL=ai.js.map