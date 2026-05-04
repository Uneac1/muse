import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyAgent } from 'undici';
import { Proxy, ProxyTestResult } from '../types';
export declare class ProxyService {
    invalidateTransportCache(proxyId?: number): void;
    private getTargetProxy;
    private isBuiltInKernelProxy;
    private isKernelProxyUsable;
    private testSocksProxy;
    private testHttpProxy;
    createSocksAgent(proxy: Proxy): SocksProxyAgent;
    createHttpDispatcher(proxy: Proxy): ProxyAgent;
    private getCachedAgent;
    getAgent(proxyId?: number): {
        agent?: SocksProxyAgent;
        dispatcher?: ProxyAgent;
        type?: string;
        proxy?: Proxy;
    };
    resolveAgent(proxyId?: number): Promise<{
        agent?: SocksProxyAgent;
        dispatcher?: ProxyAgent;
        type?: string;
        proxy?: Proxy;
        recoveryError?: string;
    }>;
    testProxy(proxy: Proxy): Promise<ProxyTestResult>;
    markFailed(id: number): void;
}
//# sourceMappingURL=ProxyService.d.ts.map