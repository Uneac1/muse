"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mailRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const MailController_1 = require("../controllers/MailController");
exports.mailRoutes = new koa_router_1.default();
const ctrl = new MailController_1.MailController();
exports.mailRoutes.post('/fetch', ctrl.fetch);
exports.mailRoutes.post('/fetch-new', ctrl.fetchNew);
exports.mailRoutes.get('/recent', ctrl.recent);
exports.mailRoutes.post('/recent/refresh', ctrl.refreshRecent);
exports.mailRoutes.post('/send', ctrl.send);
exports.mailRoutes.get('/search', ctrl.search);
exports.mailRoutes.delete('/clear', ctrl.clear);
exports.mailRoutes.get('/cached', ctrl.cached);
//# sourceMappingURL=mails.js.map