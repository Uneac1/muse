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
exports.oauthRoutes.post('/openai/authorize', ctrl.authorizeOpenAI);
exports.oauthRoutes.get('/openai/callback', ctrl.openaiCallback);
exports.oauthRoutes.post('/google/authorize', ctrl.authorizeGoogle);
exports.oauthRoutes.get('/google/callback', ctrl.googleCallback);
//# sourceMappingURL=oauth.js.map