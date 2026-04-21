"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyService = void 0;
const socks_proxy_agent_1 = require("socks-proxy-agent");
const undici_1 = require("undici");
const Proxy_1 = require("../models/Proxy");
const logger_1 = __importDefault(require("../utils/logger"));
const proxyModel = new Proxy_1.ProxyModel();
class ProxyService {
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
    getAgent(proxyId) {
        let proxy;
        if (proxyId) {
            proxy = proxyModel.getById(proxyId);
        }
        else {
            proxy = proxyModel.getDefault();
        }
        if (!proxy)
            return {};
        if (!proxy.is_enabled)
            return {};
        if (proxy.type === 'socks5') {
            return { agent: this.createSocksAgent(proxy), type: 'socks5' };
        }
        else {
            return { dispatcher: this.createHttpDispatcher(proxy), type: 'http' };
        }
    }
    async testProxy(proxy) {
        const start = Date.now();
        try {
            let response;
            if (proxy.type === 'socks5') {
                const agent = this.createSocksAgent(proxy);
                const nodefetch = require('node-fetch');
                response = await nodefetch('https://httpbin.org/ip', { agent, timeout: 15000 });
            }
            else {
                const dispatcher = this.createHttpDispatcher(proxy);
                const { fetch: undiciFetch } = require('undici');
                response = await undiciFetch('https://httpbin.org/ip', { dispatcher });
            }
            const data = await response.json();
            const latency = Date.now() - start;
            logger_1.default.info(`Proxy test success: ${proxy.host}:${proxy.port} -> ${data.origin} (${latency}ms)`);
            return { ip: data.origin, latency, status: 'active' };
        }
        catch (err) {
            logger_1.default.error(`Proxy test failed: ${proxy.host}:${proxy.port} - ${err.message}`);
            return { ip: '', latency: Date.now() - start, status: 'failed' };
        }
    }
}
exports.ProxyService = ProxyService;
//# sourceMappingURL=ProxyService.js.map