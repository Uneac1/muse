import { Proxy } from '../types';
export declare class ProxyModel {
    list(): Proxy[];
    countGroupedByStatus(): Array<{
        status: string;
        count: number;
    }>;
    getStats(): {
        total: number;
        active: number;
        statusStats: Array<{
            status: string;
            count: number;
        }>;
    };
    getById(id: number): Proxy | undefined;
    getDefault(): Proxy | undefined;
    create(data: Partial<Proxy>): Proxy;
    update(id: number, data: Partial<Proxy>): Proxy | undefined;
    delete(id: number): boolean;
    setDefault(id: number): Proxy | undefined;
    setEnabled(id: number, enabled: boolean): Proxy | undefined;
    updateTestResult(id: number, ip: string, status: 'active' | 'failed'): void;
    markFailed(id: number): void;
}
//# sourceMappingURL=Proxy.d.ts.map