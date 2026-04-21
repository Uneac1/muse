"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxyKernelRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const ProxyKernelController_1 = require("../controllers/ProxyKernelController");
exports.proxyKernelRoutes = new koa_router_1.default();
const ctrl = new ProxyKernelController_1.ProxyKernelController();
exports.proxyKernelRoutes.get('/', ctrl.status);
exports.proxyKernelRoutes.post('/download', ctrl.download);
exports.proxyKernelRoutes.post('/start', ctrl.start);
exports.proxyKernelRoutes.post('/stop', ctrl.stop);
//# sourceMappingURL=proxy-kernel.js.map