"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.newspaperRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const NewspaperController_1 = require("../controllers/NewspaperController");
exports.newspaperRoutes = new koa_router_1.default();
const ctrl = new NewspaperController_1.NewspaperController();
exports.newspaperRoutes.get('/health', ctrl.health);
exports.newspaperRoutes.get('/briefing', ctrl.briefing);
exports.newspaperRoutes.get('/article/stream', ctrl.articleStream);
exports.newspaperRoutes.get('/article', ctrl.article);
exports.newspaperRoutes.post('/insight', ctrl.insight);
exports.newspaperRoutes.post('/briefing-insight', ctrl.briefingInsight);
//# sourceMappingURL=newspaper.js.map