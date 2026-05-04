import { execFileSync } from 'child_process';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyAgent } from 'undici';
import { Proxy, ProxyTestResult } from '../types';
import { ProxyModel } from '../models/Proxy';
import { proxyKernelService } from './ProxyKernelService';
import logger from '../utils/logger';

const proxyModel = new ProxyModel();
let kernelProxyHealthCache: { checkedAt: number; port: number; usable: boolean } | null = null;
let kernelRecoveryPromise: Promise<void> | null = null;
const transportCache = new Map<string, { agent?: SocksProxyAgent; dispatcher?: ProxyAgent; type: 'socks5' | 'http'; proxy: Proxy }>();

function proxyTransportCacheKey(proxy: Proxy) {
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

function clearProxyTransportCache(proxyId?: number) {
  for (const [key] of transportCache.entries()) {
    if (proxyId === undefined || key.startsWith(`${proxyId}|`)) {
      transportCache.delete(key);
    }
  }
}

export class ProxyService {
  invalidateTransportCache(proxyId?: number) {
    clearProxyTransportCache(proxyId);
  }

  private getTargetProxy(proxyId?: number) {
    if (proxyId) return proxyModel.getById(proxyId);
    return proxyModel.getDefault();
  }

  private isBuiltInKernelProxy(proxy: Proxy) {
    const host = String(proxy.host || '').trim();
    const name = String(proxy.name || '').trim();
    return host === '127.0.0.1' && /内置代理内核|mihomo/i.test(name);
  }

  private isKernelProxyUsable(proxy: Proxy) {
    if (!this.isBuiltInKernelProxy(proxy)) return true;

    const now = Date.now();
    if (kernelProxyHealthCache && kernelProxyHealthCache.port === proxy.port && now - kernelProxyHealthCache.checkedAt < 5000) {
      return kernelProxyHealthCache.usable;
    }

    let usable = true;
    try {
      const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
      usable = output
        .split(/\r?\n/)
        .some((line) => /\bLISTENING\b/i.test(line) && line.includes(`:${proxy.port}`));
    } catch (error: any) {
      logger.warn(`Kernel proxy health check via netstat failed: ${error?.message || error}`);
    }

    kernelProxyHealthCache = { checkedAt: now, port: proxy.port, usable };
    if (!usable) {
      logger.warn(`Skipping built-in kernel proxy ${proxy.host}:${proxy.port} because the local kernel is not listening`);
    }
    return usable;
  }

  private async testSocksProxy(proxy: Proxy, start: number): Promise<ProxyTestResult> {
    const agent = this.createSocksAgent(proxy);
    const nodefetch = require('node-fetch');
    const targets = [
      { url: 'https://api.ipify.org?format=json', parser: async (res: any) => (await res.json()).ip || '' },
      { url: 'https://httpbin.org/ip', parser: async (res: any) => (await res.json()).origin || '' },
      { url: 'http://httpbin.org/ip', parser: async (res: any) => (await res.json()).origin || '' },
    ];

    for (const target of targets) {
      try {
        const response = await nodefetch(target.url, { agent, timeout: 15000 });
        if (!response.ok) continue;
        const ip = await target.parser(response);
        if (!ip) continue;
        const latency = Date.now() - start;
        logger.info(`Proxy test success: ${proxy.host}:${proxy.port} -> ${ip} via ${target.url} (${latency}ms)`);
        return { ip, latency, status: 'active' };
      } catch (err: any) {
        logger.warn(`Proxy test fallback failed: ${proxy.host}:${proxy.port} via ${target.url} - ${err.message}`);
      }
    }

    throw new Error('all SOCKS test targets failed');
  }

  private async testHttpProxy(proxy: Proxy, start: number): Promise<ProxyTestResult> {
    const dispatcher = this.createHttpDispatcher(proxy);
    const { fetch: undiciFetch } = require('undici');
    const targets = [
      { url: 'http://httpbin.org/ip', parser: async (res: any) => (await res.json()).origin || '' },
      { url: 'https://api.ipify.org?format=json', parser: async (res: any) => (await res.json()).ip || '' },
      { url: 'https://httpbin.org/ip', parser: async (res: any) => (await res.json()).origin || '' },
    ];

    for (const target of targets) {
      try {
        const response = await undiciFetch(target.url, { dispatcher });
        if (!response.ok) continue;
        const ip = await target.parser(response);
        if (!ip) continue;
        const latency = Date.now() - start;
        logger.info(`Proxy test success: ${proxy.host}:${proxy.port} -> ${ip} via ${target.url} (${latency}ms)`);
        return { ip, latency, status: 'active' };
      } catch (err: any) {
        logger.warn(`Proxy test fallback failed: ${proxy.host}:${proxy.port} via ${target.url} - ${err.message}`);
      }
    }

    throw new Error('all HTTP test targets failed');
  }

  createSocksAgent(proxy: Proxy): SocksProxyAgent {
    let url = `socks5://`;
    if (proxy.username && proxy.password) {
      url += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
    }
    url += `${proxy.host}:${proxy.port}`;
    return new SocksProxyAgent(url);
  }

  createHttpDispatcher(proxy: Proxy): ProxyAgent {
    let url = `http://`;
    if (proxy.username && proxy.password) {
      url += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
    }
    url += `${proxy.host}:${proxy.port}`;
    return new ProxyAgent(url);
  }

  private getCachedAgent(proxy: Proxy) {
    const key = proxyTransportCacheKey(proxy);
    const cached = transportCache.get(key);
    if (cached) return cached;

    const transport = proxy.type === 'socks5'
      ? { agent: this.createSocksAgent(proxy), type: 'socks5' as const, proxy }
      : { dispatcher: this.createHttpDispatcher(proxy), type: 'http' as const, proxy };
    transportCache.set(key, transport);
    return transport;
  }

  getAgent(proxyId?: number): { agent?: SocksProxyAgent; dispatcher?: ProxyAgent; type?: string; proxy?: Proxy } {
    const proxy = this.getTargetProxy(proxyId);
    if (!proxy) return {};
    if (!proxy.is_enabled) return {};
    if (proxy.status === 'failed' && !this.isBuiltInKernelProxy(proxy)) return {};
    if (proxy.status === 'failed' && this.isBuiltInKernelProxy(proxy) && !kernelRecoveryPromise) {
      kernelRecoveryPromise = proxyKernelService.ensureOpenAiProxyReady()
        .then(() => {
          kernelProxyHealthCache = null;
        })
        .catch((error) => {
          logger.warn(`Built-in kernel proxy failed-state recovery failed: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => {
          kernelRecoveryPromise = null;
        });
    }
    if (!this.isKernelProxyUsable(proxy)) {
      if (this.isBuiltInKernelProxy(proxy) && !kernelRecoveryPromise) {
        kernelRecoveryPromise = proxyKernelService.ensureOpenAiProxyReady()
          .then(() => {
            kernelProxyHealthCache = null;
          })
          .catch((error) => {
            logger.warn(`Built-in kernel proxy background recovery failed: ${error instanceof Error ? error.message : String(error)}`);
          })
          .finally(() => {
            kernelRecoveryPromise = null;
          });
      }
      return {};
    }

    return this.getCachedAgent(proxy);
  }

  async resolveAgent(proxyId?: number): Promise<{ agent?: SocksProxyAgent; dispatcher?: ProxyAgent; type?: string; proxy?: Proxy; recoveryError?: string }> {
    let proxy = this.getTargetProxy(proxyId);
    if (!proxy) return {};
    if (!proxy.is_enabled) return {};
    if (proxy.status === 'failed' && !this.isBuiltInKernelProxy(proxy)) return {};

    if (this.isBuiltInKernelProxy(proxy) && (proxy.status === 'failed' || !this.isKernelProxyUsable(proxy))) {
      try {
        await proxyKernelService.ensureOpenAiProxyReady();
        proxy = this.getTargetProxy(proxyId) || proxy;
        kernelProxyHealthCache = null;
        clearProxyTransportCache(proxy.id);
      } catch (error) {
        const recoveryError = error instanceof Error ? error.message : String(error);
        logger.warn(`Built-in kernel proxy recovery failed: ${recoveryError}`);
        return { proxy, recoveryError };
      }
      if (!this.isKernelProxyUsable(proxy)) {
        return { proxy, recoveryError: '内置代理恢复后仍未监听本地端口' };
      }
    }

    return this.getAgent(proxyId);
  }

  async testProxy(proxy: Proxy): Promise<ProxyTestResult> {
    const start = Date.now();
    try {
      if (proxy.type === 'socks5') {
        return await this.testSocksProxy(proxy, start);
      } else {
        return await this.testHttpProxy(proxy, start);
      }
    } catch (err: any) {
      logger.error(`Proxy test failed: ${proxy.host}:${proxy.port} - ${err.message}`);
      return { ip: '', latency: Date.now() - start, status: 'failed' };
    }
  }

  markFailed(id: number) {
    const proxy = proxyModel.getById(id);
    proxyModel.markFailed(id);
    clearProxyTransportCache(id);
    if (proxy && this.isBuiltInKernelProxy(proxy) && !kernelRecoveryPromise) {
      kernelRecoveryPromise = proxyKernelService.ensureOpenAiProxyReady()
        .then(() => {
          kernelProxyHealthCache = null;
          clearProxyTransportCache(id);
        })
        .catch((error) => {
          logger.warn(`Built-in kernel proxy markFailed recovery failed: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => {
          kernelRecoveryPromise = null;
        });
    }
  }
}
