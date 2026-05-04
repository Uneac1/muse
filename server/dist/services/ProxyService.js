"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyService = void 0;
const child_process_1 = require("child_process");
const socks_proxy_agent_1 = require("socks-proxy-agent");
const undici_1 = require("undici");
const Proxy_1 = require("../models/Proxy");
const ProxyKernelService_1 = require("./ProxyKernelService");
const logger_1 = __importDefault(require("../utils/logger"));
const proxyModel = new Proxy_1.ProxyModel();
let kernelProxyHealthCache = null;
let kernelRecoveryPromise = null;
const transportCache = new Map();
function proxyTransportCacheKey(proxy) {
    return [
        proxy.id,
        proxy.type,
        proxy.host,
        proxy.port,
        proxy.username,
        proxy.password,
        proxy.is_enabled ? 1 : 0,
    ].join('|');
}
function clearProxyTransportCache(proxyId) {
    for (const [key] of transportCache.entries()) {
        if (proxyId === undefined || key.startsWith(`${proxyId}|`)) {
            transportCache.delete(key);
        }
    }
}
class ProxyService {
    invalidateTransportCache(proxyId) {
        clearProxyTransportCache(proxyId);
    }
    getTargetProxy(proxyId) {
        if (proxyId)
            return proxyModel.getById(proxyId);
        return proxyModel.getDefault();
    }
    isBuiltInKernelProxy(proxy) {
        const host = String(proxy.host || '').trim();
        const name = String(proxy.name || '').trim();
        return host === '127.0.0.1' && /内置代理内核|mihomo/i.test(name);
    }
    isKernelProxyUsable(proxy) {
        if (!this.isBuiltInKernelProxy(proxy))
            return true;
        const now = Date.now();
        if (kernelProxyHealthCache && kernelProxyHealthCache.port === proxy.port && now - kernelProxyHealthCache.checkedAt < 5000) {
            return kernelProxyHealthCache.usable;
        }
        let usable = true;
        try {
            const output = (0, child_process_1.execFileSync)('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
            usable = output
                .split(/\r?\n/)
                .some((line) => /\bLISTENING\b/i.test(line) && line.includes(`:${proxy.port}`));
        }
        catch (error) {
            logger_1.default.warn(`Kernel proxy health check via netstat failed: ${error?.message || error}`);
        }
        kernelProxyHealthCache = { checkedAt: now, port: proxy.port, usable };
        if (!usable) {
            logger_1.default.warn(`Skipping built-in kernel proxy ${proxy.host}:${proxy.port} because the local kernel is not listening`);
        }
        return usable;
    }
    async testSocksProxy(proxy, start) {
        const agent = this.createSocksAgent(proxy);
        const nodefetch = require('node-fetch');
        const targets = [
            { url: 'https://api.ipify.org?format=json', parser: async (res) => (await res.json()).ip || '' },
            { url: 'https://httpbin.org/ip', parser: async (res) => (await res.json()).origin || '' },
            { url: 'http://httpbin.org/ip', parser: async (res) => (await res.json()).origin || '' },
        ];
        for (const target of targets) {
            try {
                const response = await nodefetch(target.url, { agent, timeout: 15000 });
                if (!response.ok)
                    continue;
                const ip = await target.parser(response);
                if (!ip)
                    continue;
                const latency = Date.now() - start;
                logger_1.default.info(`Proxy test success: ${proxy.host}:${proxy.port} -> ${ip} via ${target.url} (${latency}ms)`);
                return { ip, latency, status: 'active' };
            }
            catch (err) {
                logger_1.default.warn(`Proxy test fallback failed: ${proxy.host}:${proxy.port} via ${target.url} - ${err.message}`);
            }
        }
        throw new Error('all SOCKS test targets failed');
    }
    async testHttpProxy(proxy, start) {
        const dispatcher = this.createHttpDispatcher(proxy);
        const { fetch: undiciFetch } = require('undici');
        const targets = [
            { url: 'http://httpbin.org/ip', parser: async (res) => (await res.json()).origin || '' },
            { url: 'https://api.ipify.org?format=json', parser: async (res) => (await res.json()).ip || '' },
            { url: 'https://httpbin.org/ip', parser: async (res) => (await res.json()).origin || '' },
        ];
        for (const target of targets) {
            try {
                const response = await undiciFetch(target.url, { dispatcher });
                if (!response.ok)
                    continue;
                const ip = await target.parser(response);
                if (!ip)
                    continue;
                const latency = Date.now() - start;
                logger_1.default.info(`Proxy test success: ${proxy.host}:${proxy.port} -> ${ip} via ${target.url} (${latency}ms)`);
                return { ip, latency, status: 'active' };
            }
            catch (err) {
                logger_1.default.warn(`Proxy test fallback failed: ${proxy.host}:${proxy.port} via ${target.url} - ${err.message}`);
            }
        }
        throw new Error('all HTTP test targets failed');
    }
    createSocksAgent(proxy) {
        let url = `socks5://`;
        if (proxy.username && proxy.password) {
            url += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
        }
        url += `${proxy.host}:${proxy.port}`;
        return new socks_proxy_agent_1.SocksProxyAgent(url);
    }
    createHttpDispatcher(proxy) {
        let url = `http://`;
        if (proxy.username && proxy.password) {
            url += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
        }
        url += `${proxy.host}:${proxy.port}`;
        return new undici_1.ProxyAgent(url);
    }
    getCachedAgent(proxy) {
        const key = proxyTransportCacheKey(proxy);
        const cached = transportCache.get(key);
        if (cached)
            return cached;
        const transport = proxy.type === 'socks5'
            ? { agent: this.createSocksAgent(proxy), type: 'socks5', proxy }
            : { dispatcher: this.createHttpDispatcher(proxy), type: 'http', proxy };
        transportCache.set(key, transport);
        return transport;
    }
    getAgent(proxyId) {
        const proxy = this.getTargetProxy(proxyId);
        if (!proxy)
            return {};
        if (!proxy.is_enabled)
            return {};
        if (proxy.status === 'failed' && !this.isBuiltInKernelProxy(proxy))
            return {};
        if (proxy.status === 'failed' && this.isBuiltInKernelProxy(proxy) && !kernelRecoveryPromise) {
            kernelRecoveryPromise = ProxyKernelService_1.proxyKernelService.ensureOpenAiProxyReady()
                .then(() => {
                kernelProxyHealthCache = null;
            })
                .catch((error) => {
                logger_1.default.warn(`Built-in kernel proxy failed-state recovery failed: ${error instanceof Error ? error.message : String(error)}`);
            })
                .finally(() => {
                kernelRecoveryPromise = null;
            });
        }
        if (!this.isKernelProxyUsable(proxy)) {
            if (this.isBuiltInKernelProxy(proxy) && !kernelRecoveryPromise) {
                kernelRecoveryPromise = ProxyKernelService_1.proxyKernelService.ensureOpenAiProxyReady()
                    .then(() => {
                    kernelProxyHealthCache = null;
                })
                    .catch((error) => {
                    logger_1.default.warn(`Built-in kernel proxy background recovery failed: ${error instanceof Error ? error.message : String(error)}`);
                })
                    .finally(() => {
                    kernelRecoveryPromise = null;
                });
            }
            return {};
        }
        return this.getCachedAgent(proxy);
    }
    async resolveAgent(proxyId) {
        let proxy = this.getTargetProxy(proxyId);
        if (!proxy)
            return {};
        if (!proxy.is_enabled)
            return {};
        if (proxy.status === 'failed' && !this.isBuiltInKernelProxy(proxy))
            return {};
        if (this.isBuiltInKernelProxy(proxy) && (proxy.status === 'failed' || !this.isKernelProxyUsable(proxy))) {
            try {
                await ProxyKernelService_1.proxyKernelService.ensureOpenAiProxyReady();
                proxy = this.getTargetProxy(proxyId) || proxy;
                kernelProxyHealthCache = null;
                clearProxyTransportCache(proxy.id);
            }
            catch (error) {
                const recoveryError = error instanceof Error ? error.message : String(error);
                logger_1.default.warn(`Built-in kernel proxy recovery failed: ${recoveryError}`);
                return { proxy, recoveryError };
            }
            if (!this.isKernelProxyUsable(proxy)) {
                return { proxy, recoveryError: '内置代理恢复后仍未监听本地端口' };
            }
        }
        return this.getAgent(proxyId);
    }
    async testProxy(proxy) {
        const start = Date.now();
        try {
            if (proxy.type === 'socks5') {
                return await this.testSocksProxy(proxy, start);
            }
            else {
                return await this.testHttpProxy(proxy, start);
            }
        }
        catch (err) {
            logger_1.default.error(`Proxy test failed: ${proxy.host}:${proxy.port} - ${err.message}`);
            return { ip: '', latency: Date.now() - start, status: 'failed' };
        }
    }
    markFailed(id) {
        const proxy = proxyModel.getById(id);
        proxyModel.markFailed(id);
        clearProxyTransportCache(id);
        if (proxy && this.isBuiltInKernelProxy(proxy) && !kernelRecoveryPromise) {
            kernelRecoveryPromise = ProxyKernelService_1.proxyKernelService.ensureOpenAiProxyReady()
                .then(() => {
                kernelProxyHealthCache = null;
                clearProxyTransportCache(id);
            })
                .catch((error) => {
                logger_1.default.warn(`Built-in kernel proxy markFailed recovery failed: ${error instanceof Error ? error.message : String(error)}`);
            })
                .finally(() => {
                kernelRecoveryPromise = null;
            });
        }
    }
}
exports.ProxyService = ProxyService;
//# sourceMappingURL=ProxyService.js.map