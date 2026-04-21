interface KernelState {
    installed: boolean;
    version: string;
    binaryPath: string;
    running: boolean;
    pid: number | null;
    lastError: string;
    sourceKey: string;
    sourceLabel: string;
    sourceUrl: string;
    mixedPort: number;
    socksPort: number;
    httpPort: number;
    previousDefaultProxyId: number | null;
    updatedAt: string | null;
}
export interface ProxyKernelSource {
    key: string;
    label: string;
    url: string;
    kind: 'profile' | 'subscription';
}
export interface ProxyKernelStatus extends KernelState {
    availableSources: ProxyKernelSource[];
}
export declare class ProxyKernelService {
    private serverRoot;
    private dataDir;
    private snapshotFile;
    private bundledBinaryPath;
    private stateFile;
    private zipFile;
    private extractDir;
    private workDir;
    private configFile;
    private child;
    constructor();
    getStatus(): Promise<ProxyKernelStatus>;
    downloadLatestCore(): Promise<ProxyKernelStatus>;
    startKernel(payload: {
        sourceKey: string;
        sourceUrl?: string;
        sourceLabel?: string;
        mixedPort?: number;
        socksPort?: number;
        httpPort?: number;
    }): Promise<ProxyKernelStatus>;
    stopKernel(options?: {
        preserveError?: boolean;
    }): Promise<ProxyKernelStatus>;
    private fetchLatestRelease;
    private expandArchive;
    private findBinary;
    private readState;
    private writeState;
    private bootstrapBundledBinary;
    private getAvailableSources;
    private readMiSubSnapshot;
    private getMiSubRecord;
    private waitForReady;
    private findKernelProxy;
    private upsertKernelProxy;
}
export declare const proxyKernelService: ProxyKernelService;
export {};
//# sourceMappingURL=ProxyKernelService.d.ts.map