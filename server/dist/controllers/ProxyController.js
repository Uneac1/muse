"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyController = void 0;
const Proxy_1 = require("../models/Proxy");
const ProxyService_1 = require("../services/ProxyService");
const response_1 = require("../utils/response");
const model = new Proxy_1.ProxyModel();
const proxyService = new ProxyService_1.ProxyService();
class ProxyController {
    async list(ctx) {
        (0, response_1.success)(ctx, model.list());
    }
    async create(ctx) {
        const body = ctx.request.body;
        if (!body.type || !body.host || !body.port)
            return (0, response_1.fail)(ctx, 'type, host, port are required', 400);
        const proxy = model.create(body);
        proxyService.invalidateTransportCache();
        (0, response_1.success)(ctx, proxy);
    }
    async update(ctx) {
        const id = parseInt(ctx.params.id);
        const proxy = model.update(id, ctx.request.body);
        if (!proxy)
            return (0, response_1.fail)(ctx, 'Proxy not found', 404);
        proxyService.invalidateTransportCache(id);
        (0, response_1.success)(ctx, proxy);
    }
    async delete(ctx) {
        const id = parseInt(ctx.params.id);
        if (!model.delete(id))
            return (0, response_1.fail)(ctx, 'Proxy not found', 404);
        proxyService.invalidateTransportCache(id);
        (0, response_1.success)(ctx, { deleted: true });
    }
    async test(ctx) {
        const id = parseInt(ctx.params.id);
        const proxy = model.getById(id);
        if (!proxy)
            return (0, response_1.fail)(ctx, 'Proxy not found', 404);
        try {
            const result = await proxyService.testProxy(proxy);
            model.updateTestResult(id, result.ip, result.status);
            proxyService.invalidateTransportCache(id);
            (0, response_1.success)(ctx, result);
        }
        catch (err) {
            model.updateTestResult(id, '', 'failed');
            proxyService.invalidateTransportCache(id);
            (0, response_1.fail)(ctx, `Proxy test failed: ${err.message}`);
        }
    }
    async setDefault(ctx) {
        const id = parseInt(ctx.params.id);
        const proxy = model.setDefault(id);
        if (!proxy)
            return (0, response_1.fail)(ctx, 'Proxy not found', 404);
        proxyService.invalidateTransportCache();
        (0, response_1.success)(ctx, proxy);
    }
    async setEnabled(ctx) {
        const id = parseInt(ctx.params.id);
        const enabled = !!ctx.request.body?.enabled;
        const proxy = model.setEnabled(id, enabled);
        if (!proxy)
            return (0, response_1.fail)(ctx, 'Proxy not found', 404);
        proxyService.invalidateTransportCache(id);
        (0, response_1.success)(ctx, proxy);
    }
}
exports.ProxyController = ProxyController;
//# sourceMappingURL=ProxyController.js.map