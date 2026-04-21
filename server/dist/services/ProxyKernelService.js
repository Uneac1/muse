"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxyKernelService = exports.ProxyKernelService = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const IntegrationService_1 = require("./IntegrationService");
const IntegrationToken_1 = require("../models/IntegrationToken");
const Proxy_1 = require("../models/Proxy");
const logger_1 = __importDefault(require("../utils/logger"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const KERNEL_PROXY_NAME = 'Muse 内置代理内核';
const CONTROLLER_PORT = 19090;
const integrationService = new IntegrationService_1.IntegrationService();
const integrationModel = new IntegrationToken_1.IntegrationTokenModel();
const proxyModel = new Proxy_1.ProxyModel();
class ProxyKernelService {
    dataDir = path_1.default.resolve(process.cwd(), 'data', 'proxy-kernel');
    stateFile = path_1.default.join(this.dataDir, 'state.json');
    zipFile = path_1.default.join(this.dataDir, 'mihomo.zip');
    extractDir = path_1.default.join(this.dataDir, 'core');
    workDir = path_1.default.join(this.dataDir, 'runtime');
    configFile = path_1.default.join(this.workDir, 'config.yaml');
    child = null;
    constructor() {
        fs_1.default.mkdirSync(this.dataDir, { recursive: true });
        fs_1.default.mkdirSync(this.workDir, { recursive: true });
    }
    async getStatus() {
        const state = this.readState();
        const sources = await this.getAvailableSources();
        const running = !!(this.child && !this.child.killed);
        if (state.running !== running) {
            state.running = running;
            state.pid = running ? this.child?.pid || null : null;
            this.writeState(state);
        }
        return {
            ...state,
            availableSources: sources,
        };
    }
    async downloadLatestCore() {
        const release = await this.fetchLatestRelease();
        const asset = release.assets.find((item) => item.name === `mihomo-windows-amd64-compatible-${release.tag_name}.zip`)
            || release.assets.find((item) => item.name.includes('mihomo-windows-amd64-compatible'))
            || release.assets.find((item) => item.name.includes('mihomo-windows-amd64') && item.name.endsWith('.zip'));
        if (!asset?.browser_download_url) {
            throw new Error('未找到适用于 Windows amd64 的 mihomo 官方资源');
        }
        logger_1.default.info(`Downloading mihomo core: ${asset.browser_download_url}`);
        const response = await fetch(asset.browser_download_url, {
            headers: { 'User-Agent': 'muse-mail' },
            redirect: 'follow',
        });
        if (!response.ok) {
            throw new Error(`下载 mihomo 失败：${response.status} ${response.statusText}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        fs_1.default.mkdirSync(this.extractDir, { recursive: true });
        fs_1.default.writeFileSync(this.zipFile, buffer);
        fs_1.default.rmSync(this.extractDir, { recursive: true, force: true });
        fs_1.default.mkdirSync(this.extractDir, { recursive: true });
        await this.expandArchive(this.zipFile, this.extractDir);
        const binaryPath = this.findBinary(this.extractDir);
        if (!binaryPath) {
            throw new Error('解压后未找到 mihomo.exe');
        }
        const targetBinaryPath = path_1.default.join(this.dataDir, 'mihomo.exe');
        fs_1.default.copyFileSync(binaryPath, targetBinaryPath);
        const state = this.readState();
        state.installed = true;
        state.version = String(release.tag_name || '');
        state.binaryPath = targetBinaryPath;
        state.lastError = '';
        state.updatedAt = new Date().toISOString();
        this.writeState(state);
        return this.getStatus();
    }
    async startKernel(payload) {
        const status = await this.getStatus();
        if (!status.installed || !status.binaryPath || !fs_1.default.existsSync(status.binaryPath)) {
            throw new Error('内置代理核心尚未安装，请先下载 mihomo');
        }
        const source = status.availableSources.find((item) => item.key === payload.sourceKey)
            || (payload.sourceUrl ? { key: payload.sourceKey, label: payload.sourceLabel || payload.sourceKey, url: payload.sourceUrl, kind: 'profile' } : null);
        if (!source?.url) {
            throw new Error('请选择有效的 MiSub 分组或订阅链接');
        }
        await this.stopKernel({ preserveError: true });
        const mixedPort = Number(payload.mixedPort || status.mixedPort || 7890);
        const socksPort = Number(payload.socksPort || status.socksPort || 17890);
        const httpPort = Number(payload.httpPort || status.httpPort || 17891);
        const providerFile = path_1.default.join(this.workDir, 'provider.yaml').replace(/\\/g, '/');
        const yaml = [
            `mixed-port: ${mixedPort}`,
            `socks-port: ${socksPort}`,
            `port: ${httpPort}`,
            'allow-lan: false',
            'mode: rule',
            'log-level: info',
            `external-controller: 127.0.0.1:${CONTROLLER_PORT}`,
            'dns:',
            '  enable: true',
            '  ipv6: false',
            '  listen: 127.0.0.1:1053',
            '  enhanced-mode: fake-ip',
            '  nameserver:',
            '    - https://1.1.1.1/dns-query',
            '    - https://8.8.8.8/dns-query',
            'proxy-providers:',
            '  muse_provider:',
            '    type: http',
            `    url: ${JSON.stringify(source.url)}`,
            `    path: ${JSON.stringify(providerFile)}`,
            '    interval: 3600',
            '    health-check:',
            '      enable: true',
            '      interval: 600',
            '      url: https://www.gstatic.com/generate_204',
            'proxy-groups:',
            '  - name: PROXY',
            '    type: select',
            '    use:',
            '      - muse_provider',
            'rules:',
            '  - MATCH,PROXY',
            '',
        ].join('\n');
        fs_1.default.writeFileSync(this.configFile, yaml, 'utf8');
        this.child = (0, child_process_1.spawn)(status.binaryPath, ['-d', this.workDir, '-f', this.configFile], {
            cwd: this.workDir,
            windowsHide: true,
            stdio: 'pipe',
        });
        this.child.stdout?.on('data', (chunk) => logger_1.default.info(`[mihomo] ${String(chunk).trim()}`));
        this.child.stderr?.on('data', (chunk) => logger_1.default.error(`[mihomo] ${String(chunk).trim()}`));
        this.child.once('exit', (code) => {
            logger_1.default.info(`mihomo exited with code ${code}`);
            const next = this.readState();
            next.running = false;
            next.pid = null;
            if (code && code !== 0) {
                next.lastError = `mihomo exited with code ${code}`;
            }
            this.writeState(next);
            this.child = null;
        });
        await this.waitForReady();
        const previousDefault = proxyModel.getDefault();
        const kernelProxy = this.upsertKernelProxy({ mixedPort, previousDefaultProxyId: previousDefault?.id || null });
        proxyModel.setDefault(kernelProxy.id);
        const state = this.readState();
        state.running = true;
        state.pid = this.child.pid || null;
        state.sourceKey = source.key;
        state.sourceLabel = source.label;
        state.sourceUrl = source.url;
        state.mixedPort = mixedPort;
        state.socksPort = socksPort;
        state.httpPort = httpPort;
        state.previousDefaultProxyId = previousDefault?.id && previousDefault.id !== kernelProxy.id ? previousDefault.id : null;
        state.lastError = '';
        state.updatedAt = new Date().toISOString();
        this.writeState(state);
        return this.getStatus();
    }
    async stopKernel(options) {
        const state = this.readState();
        if (this.child && !this.child.killed) {
            this.child.kill();
            await new Promise((resolve) => setTimeout(resolve, 800));
        }
        this.child = null;
        const kernelProxy = this.findKernelProxy();
        if (kernelProxy) {
            proxyModel.update(kernelProxy.id, { is_enabled: false, is_default: false });
        }
        if (state.previousDefaultProxyId) {
            proxyModel.setDefault(state.previousDefaultProxyId);
        }
        state.running = false;
        state.pid = null;
        state.previousDefaultProxyId = null;
        if (!options?.preserveError) {
            state.lastError = '';
        }
        state.updatedAt = new Date().toISOString();
        this.writeState(state);
        return this.getStatus();
    }
    async fetchLatestRelease() {
        const response = await fetch('https://api.github.com/repos/MetaCubeX/mihomo/releases/latest', {
            headers: { 'User-Agent': 'muse-mail' },
        });
        if (!response.ok) {
            throw new Error(`获取 mihomo 版本失败：${response.status} ${response.statusText}`);
        }
        return response.json();
    }
    async expandArchive(zipPath, outputDir) {
        if (os_1.default.platform() !== 'win32') {
            throw new Error('当前只实现了 Windows 的内置代理核心下载流程');
        }
        await execFileAsync('powershell', [
            '-NoProfile',
            '-Command',
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`,
        ]);
    }
    findBinary(rootDir) {
        const items = fs_1.default.readdirSync(rootDir, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path_1.default.join(rootDir, item.name);
            if (item.isFile() && item.name.toLowerCase() === 'mihomo.exe') {
                return fullPath;
            }
            if (item.isDirectory()) {
                const nested = this.findBinary(fullPath);
                if (nested)
                    return nested;
            }
        }
        return null;
    }
    readState() {
        if (!fs_1.default.existsSync(this.stateFile)) {
            return {
                installed: false,
                version: '',
                binaryPath: '',
                running: false,
                pid: null,
                lastError: '',
                sourceKey: '',
                sourceLabel: '',
                sourceUrl: '',
                mixedPort: 7890,
                socksPort: 17890,
                httpPort: 17891,
                previousDefaultProxyId: null,
                updatedAt: null,
            };
        }
        try {
            const parsed = JSON.parse(fs_1.default.readFileSync(this.stateFile, 'utf8'));
            return {
                installed: !!parsed.installed,
                version: parsed.version || '',
                binaryPath: parsed.binaryPath || '',
                running: false,
                pid: null,
                lastError: parsed.lastError || '',
                sourceKey: parsed.sourceKey || '',
                sourceLabel: parsed.sourceLabel || '',
                sourceUrl: parsed.sourceUrl || '',
                mixedPort: Number(parsed.mixedPort || 7890),
                socksPort: Number(parsed.socksPort || 17890),
                httpPort: Number(parsed.httpPort || 17891),
                previousDefaultProxyId: parsed.previousDefaultProxyId || null,
                updatedAt: parsed.updatedAt || null,
            };
        }
        catch {
            return {
                installed: false,
                version: '',
                binaryPath: '',
                running: false,
                pid: null,
                lastError: '内置代理状态文件损坏，已回退默认配置',
                sourceKey: '',
                sourceLabel: '',
                sourceUrl: '',
                mixedPort: 7890,
                socksPort: 17890,
                httpPort: 17891,
                previousDefaultProxyId: null,
                updatedAt: null,
            };
        }
    }
    writeState(state) {
        fs_1.default.mkdirSync(this.dataDir, { recursive: true });
        fs_1.default.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf8');
    }
    async getAvailableSources() {
        const record = this.getMiSubRecord();
        if (!record)
            return [];
        const data = await integrationService.fetchMiSubData(record).catch(() => null);
        if (!data?.connected)
            return [];
        const root = data.baseUrl.replace(/\/+$/, '');
        const profileToken = data.settings?.profileToken || '';
        const profileSources = (data.profiles || [])
            .map((profile) => ({
            key: `profile:${profile.id}`,
            label: `分组 · ${profile.name}`,
            url: profileToken ? `${root}/${profileToken}/${profile.customId || profile.id}` : '',
            kind: 'profile',
        }))
            .filter((item) => item.url);
        const subscriptionSources = (data.misubs || [])
            .map((item) => ({
            key: `subscription:${item.id}`,
            label: `订阅 · ${item.name}`,
            url: item.url,
            kind: 'subscription',
        }))
            .filter((item) => item.url);
        return [...profileSources, ...subscriptionSources];
    }
    getMiSubRecord() {
        return integrationModel.get('misub');
    }
    async waitForReady() {
        const start = Date.now();
        while (Date.now() - start < 15000) {
            try {
                const response = await fetch(`http://127.0.0.1:${CONTROLLER_PORT}/version`);
                if (response.ok)
                    return;
            }
            catch { }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error('mihomo 启动超时，请检查订阅链接是否为 Clash / Mihomo 可识别格式');
    }
    findKernelProxy() {
        return proxyModel.list().find((item) => item.name === KERNEL_PROXY_NAME);
    }
    upsertKernelProxy(payload) {
        const existing = this.findKernelProxy();
        if (existing) {
            return proxyModel.update(existing.id, {
                type: 'http',
                host: '127.0.0.1',
                port: payload.mixedPort,
                is_enabled: true,
            });
        }
        return proxyModel.create({
            name: KERNEL_PROXY_NAME,
            type: 'http',
            host: '127.0.0.1',
            port: payload.mixedPort,
            username: '',
            password: '',
            is_default: false,
            is_enabled: true,
        });
    }
}
exports.ProxyKernelService = ProxyKernelService;
exports.proxyKernelService = new ProxyKernelService();
//# sourceMappingURL=ProxyKernelService.js.map