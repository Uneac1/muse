"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.oauthRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const OAuthController_1 = require("../controllers/OAuthController");
exports.oauthRoutes = new koa_router_1.default();
const ctrl = new OAuthController_1.OAuthController();
exports.oauthRoutes.get('/status', (ctx) => ctrl.getStatus(ctx));
exports.oauthRoutes.post('/linuxdo/authorize', (ctx) => ctrl.authorizeLinuxDo(ctx));
exports.oauthRoutes.get('/linuxdo/callback', (ctx) => ctrl.linuxDoCallback(ctx));
exports.oauthRoutes.post('/openai/authorize', (ctx) => ctrl.authorizeOpenAI(ctx));
exports.oauthRoutes.post('/openai/launch', (ctx) => ctrl.launchOpenAI(ctx));
exports.oauthRoutes.post('/openai/reset-session', (ctx) => ctrl.resetOpenAISession(ctx));
exports.oauthRoutes.get('/openai/result', (ctx) => ctrl.openaiResult(ctx));
exports.oauthRoutes.get('/openai/callback', (ctx) => ctrl.openaiCallback(ctx));
exports.oauthRoutes.post('/google/authorize', (ctx) => ctrl.authorizeGoogle(ctx));
exports.oauthRoutes.get('/google/callback', (ctx) => ctrl.googleCallback(ctx));
//# sourceMappingURL=oauth.js.map