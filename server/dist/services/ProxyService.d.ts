import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyAgent } from 'undici';
import { Proxy, ProxyTestResult } from '../types';
export declare class ProxyService {
    createSocksAgent(proxy: Proxy): SocksProxyAgent;
    createHttpDispatcher(proxy: Proxy): ProxyAgent;
    getAgent(proxyId?: number): {
        agent?: SocksProxyAgent;
        dispatcher?: ProxyAgent;
        type?: string;
    };
    testProxy(proxy: Proxy): Promise<ProxyTestResult>;
}
//# sourceMappingURL=ProxyService.d.ts.map