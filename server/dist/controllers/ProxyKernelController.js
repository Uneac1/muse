"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyKernelController = void 0;
const ProxyKernelService_1 = require("../services/ProxyKernelService");
const response_1 = require("../utils/response");
class ProxyKernelController {
    async status(ctx) {
        (0, response_1.success)(ctx, await ProxyKernelService_1.proxyKernelService.getStatus());
    }
    async download(ctx) {
        try {
            (0, response_1.success)(ctx, await ProxyKernelService_1.proxyKernelService.downloadLatestCore());
        }
        catch (error) {
            (0, response_1.fail)(ctx, error.message || '下载 mihomo 失败', 500);
        }
    }
    async start(ctx) {
        try {
            const body = ctx.request.body;
            if (!body?.sourceKey)
                return (0, response_1.fail)(ctx, 'sourceKey is required', 400);
            (0, response_1.success)(ctx, await ProxyKernelService_1.proxyKernelService.startKernel(body));
        }
        catch (error) {
            (0, response_1.fail)(ctx, error.message || '启动内置代理内核失败', 500);
        }
    }
    async stop(ctx) {
        try {
            (0, response_1.success)(ctx, await ProxyKernelService_1.proxyKernelService.stopKernel());
        }
        catch (error) {
            (0, response_1.fail)(ctx, error.message || '停止内置代理内核失败', 500);
        }
    }
    async select(ctx) {
        try {
            const body = ctx.request.body;
            (0, response_1.success)(ctx, await ProxyKernelService_1.proxyKernelService.selectProxyGroup(body));
        }
        catch (error) {
            (0, response_1.fail)(ctx, error.message || '切换代理节点失败', 500);
        }
    }
    async testOpenAi(ctx) {
        try {
            const body = ctx.request.body;
            (0, response_1.success)(ctx, await ProxyKernelService_1.proxyKernelService.testOpenAiNode(body));
        }
        catch (error) {
            (0, response_1.fail)(ctx, error.message || '测试 OpenAI 节点失败', 500);
        }
    }
}
exports.ProxyKernelController = ProxyKernelController;
//# sourceMappingURL=ProxyKernelController.js.map