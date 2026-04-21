"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxyRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const ProxyController_1 = require("../controllers/ProxyController");
exports.proxyRoutes = new koa_router_1.default();
const ctrl = new ProxyController_1.ProxyController();
exports.proxyRoutes.get('/', ctrl.list);
exports.proxyRoutes.post('/', ctrl.create);
exports.proxyRoutes.put('/:id', ctrl.update);
exports.proxyRoutes.delete('/:id', ctrl.delete);
exports.proxyRoutes.post('/:id/test', ctrl.test);
exports.proxyRoutes.put('/:id/default', ctrl.setDefault);
exports.proxyRoutes.put('/:id/enabled', ctrl.setEnabled);
//# sourceMappingURL=proxies.js.map