"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const AuthController_1 = require("../controllers/AuthController");
exports.authRoutes = new koa_router_1.default();
const ctrl = new AuthController_1.AuthController();
exports.authRoutes.post('/login', ctrl.login);
exports.authRoutes.get('/check', ctrl.check);
exports.authRoutes.post('/google/authorize', ctrl.authorizeGoogle);
exports.authRoutes.get('/google/callback', ctrl.googleCallback);
//# sourceMappingURL=auth.js.map