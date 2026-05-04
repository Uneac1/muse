import type { ProxyKernelHealth } from '../types';
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
    openAiGroupName: string;
    openAiNodeName: string;
    updatedAt: string | null;
    health: ProxyKernelHealth;
    lastSuccessfulNode: string;
    lastSuccessfulAt: string | null;
    recoveryState: string;
    lastRecoveryError: string;
}
export interface ProxyKernelSource {
    key: string;
    label: string;
    url: string;
    kind: 'profile' | 'subscription';
}
export interface ProxyKernelGroup {
    name: string;
    type: string;
    now: string;
    all: string[];
}
export interface ProxyKernelStatus extends KernelState {
    availableSources: ProxyKernelSource[];
    proxyGroups: ProxyKernelGroup[];
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
    private bootstrapPromise;
    private guardTimer;
    private guardPromise;
    private nodeHealthCache;
    private handshakeFailureLogCache;
    private runtimeState;
    constructor();
    startGuardian(): void;
    getStatus(): Promise<ProxyKernelStatus>;
    ensureKernelBootstrapped(): Promise<ProxyKernelStatus | null>;
    downloadLatestCore(): Promise<ProxyKernelStatus>;
    startKernel(payload: {
        sourceKey: string;
        sourceUrl?: string;
        sourceLabel?: string;
        mixedPort?: number;
        socksPort?: number;
        httpPort?: number;
    }, options?: {
        skipOpenAiCalibration?: boolean;
    }): Promise<ProxyKernelStatus>;
    ensureOpenAiProxyReady(): Promise<{
        selector: string;
        selected: string;
        tested: string[];
    }>;
    selectProxyGroup(payload: {
        groupName?: string;
        target?: string;
    }): Promise<ProxyKernelStatus>;
    testOpenAiNode(payload?: {
        groupName?: string;
        target?: string;
    }): Promise<{
        ok: boolean;
        groupName: string;
        target: string;
        original: string | undefined;
        message: string;
    }>;
    stopKernel(options?: {
        preserveError?: boolean;
    }): Promise<ProxyKernelStatus>;
    private fetchLatestRelease;
    private getProxySelector;
    private getProxyGroups;
    private setProxySelector;
    private testOpenAiHandshakeDetailed;
    private logHandshakeFailure;
    private testOpenAiHandshake;
    private expandArchive;
    private findBinary;
    private readState;
    private writeState;
    private computeHealth;
    private setRecoveryState;
    private recordSuccessfulNode;
    private markKernelProxyActive;
    private markKernelProxyFailed;
    private getNodeHealthCacheKey;
    private getCachedNodeHealth;
    private setCachedNodeHealth;
    private ensureKernelProxyConsistency;
    private ensureCurrentOpenAiNodeHealthy;
    private guardTick;
    private ensureKernelRunningForOpenAi;
    private recoverKernelForOpenAi;
    private bootstrapBundledBinary;
    private getAvailableSources;
    private readMiSubSnapshot;
    private killExistingKernelProcesses;
    private findKernelProcessId;
    private findKernelProcessIds;
    private safeExecFile;
    private getMiSubData;
    private buildKernelConfigYaml;
    private normalizeConverterUrl;
    private fetchConvertedClashConfig;
    private patchClashConfig;
    private getMiSubRecord;
    private waitForReady;
    private launchKernelProcess;
    private isKernelRunning;
    private isPidAlive;
    private isTcpPortOpen;
    private findKernelProxy;
    private upsertKernelProxy;
}
export declare const proxyKernelService: ProxyKernelService;
export {};
//# sourceMappingURL=ProxyKernelService.d.ts.map