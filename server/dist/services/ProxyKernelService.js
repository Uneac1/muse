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
const net_1 = __importDefault(require("net"));
const util_1 = require("util");
const IntegrationService_1 = require("./IntegrationService");
const IntegrationToken_1 = require("../models/IntegrationToken");
const Proxy_1 = require("../models/Proxy");
const logger_1 = __importDefault(require("../utils/logger"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const KERNEL_PROXY_NAME = 'Muse 内置代理内核';
const CONTROLLER_PORT = 19090;
const OPENAI_SELECTOR = '🤖 OpenAi';
const OPENAI_PREFERRED_GROUPS = ['🇸🇬 狮城节点', '🇯🇵 日本节点', '🇺🇲 美国节点', '🇹🇼 台湾节点', '🇭🇰 香港节点'];
const GUARD_INTERVAL_MS = 30 * 1000;
const NODE_SUCCESS_CACHE_MS = 10 * 60 * 1000;
const NODE_FAILURE_COOLDOWN_MS = 3 * 60 * 1000;
const OPENAI_HANDSHAKE_TIMEOUT_MS = 3500;
const HANDSHAKE_FAILURE_LOG_COOLDOWN_MS = 30 * 1000;
const integrationService = new IntegrationService_1.IntegrationService();
const integrationModel = new IntegrationToken_1.IntegrationTokenModel();
const proxyModel = new Proxy_1.ProxyModel();
class ProxyKernelService {
    serverRoot = path_1.default.resolve(__dirname, '..', '..');
    dataDir = path_1.default.join(this.serverRoot, 'data', 'proxy-kernel');
    snapshotFile = path_1.default.join(this.serverRoot, 'data', 'integration-snapshots.json');
    bundledBinaryPath = path_1.default.join(this.serverRoot, 'bin', 'mihomo', 'windows-amd64', 'mihomo.exe');
    stateFile = path_1.default.join(this.dataDir, 'state.json');
    zipFile = path_1.default.join(this.dataDir, 'mihomo.zip');
    extractDir = path_1.default.join(this.dataDir, 'core');
    workDir = path_1.default.join(this.dataDir, 'runtime');
    configFile = path_1.default.join(this.workDir, 'config.yaml');
    child = null;
    bootstrapPromise = null;
    guardTimer = null;
    guardPromise = null;
    nodeHealthCache = new Map();
    handshakeFailureLogCache = new Map();
    runtimeState;
    constructor() {
        fs_1.default.mkdirSync(this.dataDir, { recursive: true });
        fs_1.default.mkdirSync(this.workDir, { recursive: true });
        const initial = this.readState();
        this.runtimeState = {
            health: initial.health,
            lastSuccessfulNode: initial.lastSuccessfulNode,
            lastSuccessfulAt: initial.lastSuccessfulAt,
            recoveryState: initial.recoveryState,
            lastRecoveryError: initial.lastRecoveryError,
        };
        this.bootstrapBundledBinary();
    }
    startGuardian() {
        if (this.guardTimer)
            return;
        this.guardTimer = setInterval(() => {
            this.guardTick().catch((error) => {
                logger_1.default.warn(`mihomo guardian tick failed: ${error instanceof Error ? error.message : String(error)}`);
            });
        }, GUARD_INTERVAL_MS);
    }
    async getStatus() {
        const state = this.readState();
        const [sources, running] = await Promise.all([
            this.getAvailableSources(),
            this.isKernelRunning(state),
        ]);
        if (state.running !== running) {
            state.running = running;
            state.pid = running ? (this.child?.pid || state.pid || null) : null;
            this.writeState(state);
        }
        if (running && !state.pid) {
            const inferredPid = await this.findKernelProcessId();
            if (inferredPid) {
                state.pid = inferredPid;
                this.writeState(state);
            }
        }
        const proxyGroups = running ? await this.getProxyGroups().catch(() => []) : [];
        const openAiGroup = proxyGroups.find((item) => item.name === (state.openAiGroupName || OPENAI_SELECTOR))
            || proxyGroups.find((item) => item.name === OPENAI_SELECTOR);
        if (openAiGroup && (state.openAiGroupName !== openAiGroup.name || state.openAiNodeName !== openAiGroup.now)) {
            state.openAiGroupName = openAiGroup.name;
            state.openAiNodeName = openAiGroup.now || state.openAiNodeName || '';
            this.writeState(state);
        }
        if (running && state.openAiNodeName && !state.lastSuccessfulNode) {
            state.lastSuccessfulNode = state.openAiNodeName;
            state.lastSuccessfulAt = state.updatedAt || new Date().toISOString();
            this.writeState(state);
        }
        this.ensureKernelProxyConsistency(state);
        return {
            ...state,
            health: this.computeHealth(state, running),
            lastSuccessfulNode: this.runtimeState.lastSuccessfulNode || state.lastSuccessfulNode || '',
            lastSuccessfulAt: this.runtimeState.lastSuccessfulAt || state.lastSuccessfulAt || null,
            recoveryState: this.runtimeState.recoveryState || state.recoveryState || '',
            lastRecoveryError: this.runtimeState.lastRecoveryError || state.lastRecoveryError || '',
            availableSources: sources,
            proxyGroups,
        };
    }
    async ensureKernelBootstrapped() {
        if (this.bootstrapPromise)
            return this.bootstrapPromise;
        this.bootstrapPromise = (async () => {
            const status = await this.getStatus();
            if (status.running) {
                logger_1.default.info('mihomo bootstrap skipped: kernel is already running');
                return status;
            }
            const sources = status.availableSources || [];
            const source = sources.find((item) => item.key === status.sourceKey)
                || sources.find((item) => item.url === status.sourceUrl)
                || sources[0];
            if (!source?.url) {
                logger_1.default.info('mihomo bootstrap skipped: no available MiSub source found yet');
                return null;
            }
            logger_1.default.info(`mihomo bootstrap starting with source ${source.label}`);
            try {
                return await this.startKernel({
                    sourceKey: source.key,
                    sourceUrl: source.url,
                    sourceLabel: source.label,
                    mixedPort: status.mixedPort,
                    socksPort: status.socksPort,
                    httpPort: status.httpPort,
                });
            }
            catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                logger_1.default.warn(`mihomo bootstrap failed: ${detail}`);
                const next = this.readState();
                next.lastError = detail;
                next.updatedAt = new Date().toISOString();
                this.writeState(next);
                return null;
            }
        })();
        try {
            return await this.bootstrapPromise;
        }
        finally {
            this.bootstrapPromise = null;
        }
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
    async startKernel(payload, options) {
        let status = await this.getStatus();
        if (!status.installed || !status.binaryPath || !fs_1.default.existsSync(status.binaryPath)) {
            logger_1.default.info('mihomo core not installed, auto-downloading before start');
            status = await this.downloadLatestCore();
        }
        const source = status.availableSources.find((item) => item.key === payload.sourceKey)
            || (payload.sourceUrl ? { key: payload.sourceKey, label: payload.sourceLabel || payload.sourceKey, url: payload.sourceUrl, kind: 'profile' } : null);
        if (!source?.url) {
            throw new Error('请选择有效的 MiSub 分组或订阅链接');
        }
        const mixedPort = Number(payload.mixedPort || status.mixedPort || 7890);
        const socksPort = Number(payload.socksPort || status.socksPort || 17890);
        const httpPort = Number(payload.httpPort || status.httpPort || 17891);
        if (await this.isKernelRunning({ ...status, mixedPort })) {
            const previousDefault = proxyModel.getDefault();
            const kernelProxy = this.upsertKernelProxy({ mixedPort, previousDefaultProxyId: previousDefault?.id || null });
            proxyModel.setDefault(kernelProxy.id);
            const state = this.readState();
            state.running = true;
            state.sourceKey = source.key || state.sourceKey;
            state.sourceLabel = source.label || state.sourceLabel;
            state.sourceUrl = source.url || state.sourceUrl;
            state.mixedPort = mixedPort;
            state.socksPort = socksPort;
            state.httpPort = httpPort;
            state.previousDefaultProxyId = previousDefault?.id && previousDefault.id !== kernelProxy.id ? previousDefault.id : state.previousDefaultProxyId;
            state.lastError = '';
            state.health = 'healthy';
            state.recoveryState = 'steady';
            state.lastRecoveryError = '';
            state.updatedAt = new Date().toISOString();
            this.writeState(state);
            if (!options?.skipOpenAiCalibration) {
                await this.ensureOpenAiProxyReady().catch((error) => {
                    logger_1.default.warn(`OpenAI proxy group auto-selection failed: ${String(error)}`);
                });
            }
            logger_1.default.info('mihomo is already running; reused existing built-in proxy process instead of restarting');
            return this.getStatus();
        }
        await this.stopKernel({ preserveError: true });
        await this.killExistingKernelProcesses();
        const miSubData = await this.getMiSubData();
        const yaml = await this.buildKernelConfigYaml({
            sourceUrl: source.url,
            miSubData,
            mixedPort,
            socksPort,
            httpPort,
        });
        fs_1.default.writeFileSync(this.configFile, yaml, 'utf8');
        const launchedPid = await this.launchKernelProcess(status.binaryPath);
        await this.waitForReady();
        const previousDefault = proxyModel.getDefault();
        const kernelProxy = this.upsertKernelProxy({ mixedPort, previousDefaultProxyId: previousDefault?.id || null });
        proxyModel.setDefault(kernelProxy.id);
        const state = this.readState();
        state.running = true;
        state.pid = launchedPid;
        state.sourceKey = source.key;
        state.sourceLabel = source.label;
        state.sourceUrl = source.url;
        state.mixedPort = mixedPort;
        state.socksPort = socksPort;
        state.httpPort = httpPort;
        state.previousDefaultProxyId = previousDefault?.id && previousDefault.id !== kernelProxy.id ? previousDefault.id : null;
        state.lastError = '';
        state.health = 'healthy';
        state.recoveryState = 'steady';
        state.lastRecoveryError = '';
        state.updatedAt = new Date().toISOString();
        this.writeState(state);
        if (!options?.skipOpenAiCalibration) {
            await this.ensureOpenAiProxyReady().catch((error) => {
                logger_1.default.warn(`OpenAI proxy group auto-selection failed: ${String(error)}`);
            });
        }
        return this.getStatus();
    }
    async ensureOpenAiProxyReady() {
        let lastError = null;
        this.setRecoveryState('recovering', 'calibrating-openai');
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const status = await this.ensureKernelRunningForOpenAi();
                const state = this.readState();
                const selectorName = state.openAiGroupName || OPENAI_SELECTOR;
                let selector = await this.getProxySelector(selectorName);
                let activeSelectorName = selectorName;
                if (!selector && selectorName !== OPENAI_SELECTOR) {
                    selector = await this.getProxySelector(OPENAI_SELECTOR);
                    activeSelectorName = OPENAI_SELECTOR;
                }
                if (!selector) {
                    throw new Error(`未找到 ${selectorName} 分组`);
                }
                const available = selector.all || [];
                const tested = [];
                const preferred = OPENAI_PREFERRED_GROUPS.filter((item) => available.includes(item));
                const manual = state.openAiNodeName && available.includes(state.openAiNodeName) ? [state.openAiNodeName] : [];
                const current = selector.now && available.includes(selector.now) ? [selector.now] : [];
                const candidates = Array.from(new Set([
                    ...manual,
                    ...current,
                    ...preferred,
                    ...available,
                ].filter(Boolean)));
                const plans = [];
                for (const candidate of candidates) {
                    const nestedSelector = await this.getProxySelector(candidate).catch(() => null);
                    const nestedOptions = Array.isArray(nestedSelector?.all) ? nestedSelector.all.filter(Boolean) : [];
                    if (nestedOptions.length > 0) {
                        const nestedCurrent = nestedSelector?.now && nestedOptions.includes(nestedSelector.now) ? [nestedSelector.now] : [];
                        for (const nestedCandidate of Array.from(new Set([...nestedCurrent, ...nestedOptions]))) {
                            plans.push({
                                topCandidate: candidate,
                                nestedCandidate,
                                label: `${candidate} -> ${nestedCandidate}`,
                            });
                        }
                        continue;
                    }
                    plans.push({ topCandidate: candidate, nestedCandidate: null, label: candidate });
                }
                for (const plan of plans) {
                    tested.push(plan.label);
                    const cacheKey = plan.nestedCandidate ? `${plan.topCandidate} -> ${plan.nestedCandidate}` : plan.topCandidate;
                    const cached = this.getCachedNodeHealth(activeSelectorName, cacheKey);
                    if (cached?.ok && Date.now() - cached.checkedAt < NODE_SUCCESS_CACHE_MS) {
                        if (selector.now !== plan.topCandidate) {
                            await this.setProxySelector(activeSelectorName, plan.topCandidate);
                            await new Promise((resolve) => setTimeout(resolve, 200));
                        }
                        if (plan.nestedCandidate) {
                            await this.setProxySelector(plan.topCandidate, plan.nestedCandidate);
                            await new Promise((resolve) => setTimeout(resolve, 200));
                        }
                        this.recordSuccessfulNode(activeSelectorName, plan.nestedCandidate || plan.topCandidate);
                        return { selector: activeSelectorName, selected: plan.label, tested };
                    }
                    if (cached && !cached.ok && cached.cooldownUntil > Date.now()) {
                        continue;
                    }
                    await this.setProxySelector(activeSelectorName, plan.topCandidate);
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    if (plan.nestedCandidate) {
                        await this.setProxySelector(plan.topCandidate, plan.nestedCandidate);
                        await new Promise((resolve) => setTimeout(resolve, 300));
                    }
                    const probe = await this.testOpenAiHandshakeDetailed(status.mixedPort || 7890);
                    this.setCachedNodeHealth(activeSelectorName, cacheKey, probe);
                    if (probe.ok) {
                        const next = this.readState();
                        const selectorChanged = next.openAiGroupName !== activeSelectorName || next.openAiNodeName !== plan.topCandidate;
                        if (selectorChanged) {
                            logger_1.default.info(`OpenAI proxy selector is ready: ${plan.label}`);
                        }
                        next.openAiGroupName = activeSelectorName;
                        next.openAiNodeName = plan.topCandidate;
                        next.updatedAt = new Date().toISOString();
                        this.recordSuccessfulNode(activeSelectorName, plan.nestedCandidate || plan.topCandidate);
                        this.writeState(next);
                        return { selector: activeSelectorName, selected: plan.label, tested };
                    }
                }
                throw new Error(`OpenAI 分组未找到可用出口，已尝试：${tested.join(' / ') || '无候选节点'}`);
            }
            catch (error) {
                lastError = error;
                if (attempt === 0) {
                    this.setRecoveryState('recovering', 'reload-openai-state', error);
                    await this.getStatus().catch(() => undefined);
                    continue;
                }
                if (attempt === 1) {
                    logger_1.default.warn(`OpenAI proxy ready check failed, trying kernel self-heal: ${error instanceof Error ? error.message : String(error)}`);
                    this.setRecoveryState('recovering', 'restart-openai-kernel', error);
                    await this.recoverKernelForOpenAi().catch((recoverError) => {
                        logger_1.default.warn(`OpenAI proxy self-heal failed: ${recoverError instanceof Error ? recoverError.message : String(recoverError)}`);
                    });
                    continue;
                }
            }
        }
        this.setRecoveryState('failed', 'openai-calibration-failed', lastError);
        throw lastError instanceof Error ? lastError : new Error(String(lastError || 'OpenAI 代理就绪失败'));
    }
    async selectProxyGroup(payload) {
        const groupName = String(payload.groupName || '').trim();
        const target = String(payload.target || '').trim();
        if (!groupName || !target) {
            throw new Error('groupName 和 target 不能为空');
        }
        const state = this.readState();
        if (!(await this.isKernelRunning(state))) {
            throw new Error('内置代理内核未运行，请先启动');
        }
        const selector = await this.getProxySelector(groupName);
        if (!selector) {
            throw new Error(`未找到代理分组：${groupName}`);
        }
        if (!selector.all?.includes(target)) {
            throw new Error(`${target} 不在 ${groupName} 的可选节点里`);
        }
        await this.setProxySelector(groupName, target);
        await new Promise((resolve) => setTimeout(resolve, 400));
        const probe = await this.testOpenAiHandshakeDetailed(state.mixedPort || 7890);
        this.setCachedNodeHealth(groupName, target, probe);
        if (probe.ok) {
            this.recordSuccessfulNode(groupName, target);
            return this.getStatus();
        }
        this.markKernelProxyFailed();
        logger_1.default.warn(`Selected OpenAI node ${groupName} -> ${target} failed probe, starting automatic failover: ${probe.detail}`);
        try {
            await this.ensureOpenAiProxyReady();
            return this.getStatus();
        }
        catch (error) {
            throw new Error(`节点 ${groupName} -> ${target} 不可用，自动切换也失败了：${probe.detail}`);
        }
    }
    async testOpenAiNode(payload) {
        const state = this.readState();
        if (!(await this.isKernelRunning(state))) {
            throw new Error('内置代理内核未运行，请先启动');
        }
        const selectorName = String(payload?.groupName || state.openAiGroupName || OPENAI_SELECTOR).trim();
        const selector = await this.getProxySelector(selectorName);
        if (!selector) {
            throw new Error(`未找到代理分组：${selectorName}`);
        }
        const target = String(payload?.target || state.openAiNodeName || selector.now || '').trim();
        if (!target) {
            throw new Error(`分组 ${selectorName} 当前没有可测试节点`);
        }
        if (!selector.all?.includes(target)) {
            throw new Error(`${target} 不在 ${selectorName} 的可选节点里`);
        }
        const original = selector.now;
        let restored = false;
        try {
            if (original !== target) {
                await this.setProxySelector(selectorName, target);
                await new Promise((resolve) => setTimeout(resolve, 400));
            }
            const probe = await this.testOpenAiHandshakeDetailed(state.mixedPort || 7890);
            this.setCachedNodeHealth(selectorName, target, probe);
            if (probe.ok && original === target) {
                this.recordSuccessfulNode(selectorName, target);
            }
            return {
                ok: probe.ok,
                groupName: selectorName,
                target,
                original,
                message: probe.ok
                    ? `OpenAI 连通性正常：${selectorName} -> ${target}`
                    : `OpenAI 连通性失败：${selectorName} -> ${target} · ${probe.detail}`,
            };
        }
        finally {
            if (original && original !== target) {
                await this.setProxySelector(selectorName, original).catch((error) => {
                    logger_1.default.warn(`Failed to restore selector ${selectorName} to ${original}: ${String(error)}`);
                });
                restored = true;
            }
            if (restored) {
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
        }
    }
    async stopKernel(options) {
        const state = this.readState();
        if (this.child && !this.child.killed) {
            this.child.kill();
            await new Promise((resolve) => setTimeout(resolve, 800));
        }
        this.child = null;
        await this.killExistingKernelProcesses().catch((error) => {
            logger_1.default.warn(`Unable to stop existing mihomo processes via system tools: ${error instanceof Error ? error.message : String(error)}`);
        });
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
        state.health = options?.preserveError ? 'degraded' : 'failed';
        state.recoveryState = options?.preserveError ? 'stopped-for-recovery' : 'stopped';
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
    async getProxySelector(name) {
        const response = await fetch(`http://127.0.0.1:${CONTROLLER_PORT}/proxies/${encodeURIComponent(name)}`);
        if (!response.ok)
            return null;
        return response.json();
    }
    async getProxyGroups() {
        const response = await fetch(`http://127.0.0.1:${CONTROLLER_PORT}/proxies`);
        if (!response.ok)
            return [];
        const payload = await response.json();
        const proxies = payload.proxies || {};
        return Object.entries(proxies)
            .map(([name, value]) => ({
            name,
            type: String(value?.type || ''),
            now: String(value?.now || ''),
            all: Array.isArray(value?.all) ? value.all.map((item) => String(item)) : [],
        }))
            .filter((item) => item.all.length > 0)
            .sort((a, b) => {
            if (a.name === OPENAI_SELECTOR)
                return -1;
            if (b.name === OPENAI_SELECTOR)
                return 1;
            return a.name.localeCompare(b.name, 'zh-Hans-CN');
        });
    }
    async setProxySelector(groupName, target) {
        const response = await fetch(`http://127.0.0.1:${CONTROLLER_PORT}/proxies/${encodeURIComponent(groupName)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: target }),
        });
        if (!response.ok) {
            const message = await response.text().catch(() => '');
            throw new Error(`切换 ${groupName} 到 ${target} 失败：${response.status} ${message || response.statusText}`);
        }
    }
    async testOpenAiHandshakeDetailed(mixedPort) {
        const { ProxyAgent, fetch: undiciFetch } = require('undici');
        const dispatcher = new ProxyAgent(`http://127.0.0.1:${mixedPort}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), OPENAI_HANDSHAKE_TIMEOUT_MS);
        try {
            const response = await undiciFetch('https://auth.openai.com/.well-known/openid-configuration', {
                method: 'GET',
                dispatcher,
                signal: controller.signal,
                headers: {
                    'user-agent': 'muse-mail/openai-probe',
                },
            });
            if (response.status >= 200 && response.status < 400) {
                return { ok: true, kind: 'ok', detail: `status=${response.status}`, status: response.status };
            }
            if ([401, 403, 451].includes(response.status)) {
                return { ok: false, kind: 'provider_blocked', detail: `status=${response.status}`, status: response.status };
            }
            return { ok: false, kind: 'network_unreachable', detail: `status=${response.status}`, status: response.status };
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.logHandshakeFailure(detail);
            if (/ECONNREFUSED|127\.0\.0\.1/.test(detail)) {
                return { ok: false, kind: 'local_proxy_unavailable', detail, status: null };
            }
            if (/controller/i.test(detail)) {
                return { ok: false, kind: 'controller_unavailable', detail, status: null };
            }
            return { ok: false, kind: 'network_unreachable', detail, status: null };
        }
        finally {
            clearTimeout(timeout);
            dispatcher.close().catch(() => undefined);
        }
    }
    logHandshakeFailure(detail) {
        const now = Date.now();
        const previous = this.handshakeFailureLogCache.get(detail) || 0;
        if (now - previous < HANDSHAKE_FAILURE_LOG_COOLDOWN_MS)
            return;
        this.handshakeFailureLogCache.set(detail, now);
        logger_1.default.warn(`OpenAI handshake probe failed via built-in proxy: ${detail}`);
    }
    async testOpenAiHandshake(mixedPort) {
        const result = await this.testOpenAiHandshakeDetailed(mixedPort);
        return result.ok;
    }
    async expandArchive(zipPath, outputDir) {
        if (os_1.default.platform() !== 'win32') {
            throw new Error('当前只实现了 Windows 的内置代理核心下载流程');
        }
        await this.safeExecFile('powershell', [
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
        const bundledInstalled = fs_1.default.existsSync(this.bundledBinaryPath);
        if (!fs_1.default.existsSync(this.stateFile)) {
            return {
                installed: bundledInstalled,
                version: '',
                binaryPath: bundledInstalled ? this.bundledBinaryPath : '',
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
                openAiGroupName: OPENAI_SELECTOR,
                openAiNodeName: '',
                updatedAt: null,
                health: this.runtimeState?.health || 'degraded',
                lastSuccessfulNode: this.runtimeState?.lastSuccessfulNode || '',
                lastSuccessfulAt: this.runtimeState?.lastSuccessfulAt || null,
                recoveryState: this.runtimeState?.recoveryState || 'state-missing',
                lastRecoveryError: this.runtimeState?.lastRecoveryError || '',
            };
        }
        try {
            const parsed = JSON.parse(fs_1.default.readFileSync(this.stateFile, 'utf8'));
            return {
                installed: bundledInstalled || !!parsed.installed,
                version: parsed.version || '',
                binaryPath: bundledInstalled ? this.bundledBinaryPath : parsed.binaryPath || '',
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
                openAiGroupName: parsed.openAiGroupName || OPENAI_SELECTOR,
                openAiNodeName: parsed.openAiNodeName || '',
                updatedAt: parsed.updatedAt || null,
                health: parsed.health || this.runtimeState?.health || 'degraded',
                lastSuccessfulNode: parsed.lastSuccessfulNode || this.runtimeState?.lastSuccessfulNode || '',
                lastSuccessfulAt: parsed.lastSuccessfulAt || this.runtimeState?.lastSuccessfulAt || null,
                recoveryState: parsed.recoveryState || this.runtimeState?.recoveryState || '',
                lastRecoveryError: parsed.lastRecoveryError || this.runtimeState?.lastRecoveryError || '',
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
                openAiGroupName: OPENAI_SELECTOR,
                openAiNodeName: '',
                updatedAt: null,
                health: this.runtimeState?.health || 'degraded',
                lastSuccessfulNode: this.runtimeState?.lastSuccessfulNode || '',
                lastSuccessfulAt: this.runtimeState?.lastSuccessfulAt || null,
                recoveryState: 'state-corrupted',
                lastRecoveryError: '内置代理状态文件损坏，已回退默认配置',
            };
        }
    }
    writeState(state) {
        fs_1.default.mkdirSync(this.dataDir, { recursive: true });
        this.runtimeState = {
            health: state.health,
            lastSuccessfulNode: state.lastSuccessfulNode,
            lastSuccessfulAt: state.lastSuccessfulAt,
            recoveryState: state.recoveryState,
            lastRecoveryError: state.lastRecoveryError,
        };
        try {
            const tempFile = `${this.stateFile}.tmp`;
            fs_1.default.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
            fs_1.default.renameSync(tempFile, this.stateFile);
        }
        catch (error) {
            logger_1.default.warn(`Failed to persist proxy kernel state: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    computeHealth(state, running) {
        if (this.runtimeState.health === 'recovering')
            return 'recovering';
        if (!running && state.lastError)
            return 'failed';
        if (!running)
            return 'degraded';
        if (state.lastError || this.runtimeState.lastRecoveryError)
            return 'degraded';
        return 'healthy';
    }
    setRecoveryState(health, recoveryState, error) {
        const next = this.readState();
        next.health = health;
        next.recoveryState = recoveryState;
        next.lastRecoveryError = error ? (error instanceof Error ? error.message : String(error)) : '';
        if (health === 'healthy') {
            next.lastError = '';
            next.lastRecoveryError = '';
        }
        next.updatedAt = new Date().toISOString();
        this.writeState(next);
        if (health === 'failed') {
            this.markKernelProxyFailed();
        }
    }
    recordSuccessfulNode(groupName, nodeName) {
        const next = this.readState();
        next.openAiGroupName = groupName;
        next.openAiNodeName = nodeName;
        next.lastSuccessfulNode = nodeName;
        next.lastSuccessfulAt = new Date().toISOString();
        next.health = 'healthy';
        next.recoveryState = 'steady';
        next.lastRecoveryError = '';
        next.updatedAt = next.lastSuccessfulAt;
        this.writeState(next);
        this.markKernelProxyActive(nodeName);
    }
    markKernelProxyActive(nodeName) {
        const kernelProxy = this.findKernelProxy();
        if (!kernelProxy)
            return;
        proxyModel.updateTestResult(kernelProxy.id, `kernel:${nodeName}`, 'active');
    }
    markKernelProxyFailed() {
        const kernelProxy = this.findKernelProxy();
        if (!kernelProxy)
            return;
        proxyModel.markFailed(kernelProxy.id);
    }
    getNodeHealthCacheKey(groupName, nodeName) {
        return `${groupName}::${nodeName}`;
    }
    getCachedNodeHealth(groupName, nodeName) {
        return this.nodeHealthCache.get(this.getNodeHealthCacheKey(groupName, nodeName));
    }
    setCachedNodeHealth(groupName, nodeName, result) {
        const checkedAt = Date.now();
        this.nodeHealthCache.set(this.getNodeHealthCacheKey(groupName, nodeName), {
            ok: result.ok,
            kind: result.kind,
            detail: result.detail,
            checkedAt,
            cooldownUntil: result.ok ? checkedAt : checkedAt + NODE_FAILURE_COOLDOWN_MS,
        });
    }
    ensureKernelProxyConsistency(state) {
        if (!state.running)
            return;
        const kernelProxy = this.findKernelProxy();
        if (!kernelProxy)
            return;
        const currentDefault = proxyModel.getDefault();
        if (!currentDefault || currentDefault.id !== kernelProxy.id) {
            proxyModel.setDefault(kernelProxy.id);
        }
    }
    async ensureCurrentOpenAiNodeHealthy(status) {
        const selectorName = status.openAiGroupName || OPENAI_SELECTOR;
        const nodeName = status.openAiNodeName;
        const kernelProxy = this.findKernelProxy();
        if (!nodeName) {
            logger_1.default.warn('Built-in proxy has no recorded OpenAI node, triggering automatic node selection');
            await this.ensureOpenAiProxyReady();
            return;
        }
        if (kernelProxy?.status === 'failed' || status.health === 'degraded' || status.health === 'failed' || status.health === 'recovering') {
            logger_1.default.warn(`Built-in proxy health is ${status.health} with proxy status ${kernelProxy?.status || 'unknown'}, triggering automatic recovery`);
            await this.ensureOpenAiProxyReady();
            return;
        }
        const cached = this.getCachedNodeHealth(selectorName, nodeName);
        if (cached?.ok && Date.now() - cached.checkedAt < NODE_SUCCESS_CACHE_MS) {
            this.markKernelProxyActive(nodeName);
            return;
        }
        const probe = await this.testOpenAiHandshakeDetailed(status.mixedPort || 7890);
        this.setCachedNodeHealth(selectorName, nodeName, probe);
        if (probe.ok) {
            this.recordSuccessfulNode(selectorName, nodeName);
            return;
        }
        this.markKernelProxyFailed();
        logger_1.default.warn(`Current OpenAI node ${selectorName} -> ${nodeName} failed guardian probe, triggering automatic failover: ${probe.detail}`);
        await this.ensureOpenAiProxyReady();
    }
    async guardTick() {
        if (this.guardPromise)
            return this.guardPromise;
        this.guardPromise = (async () => {
            const status = await this.getStatus();
            if (status.running) {
                this.ensureKernelProxyConsistency(status);
                await this.ensureCurrentOpenAiNodeHealthy(status);
                return;
            }
            const source = status.availableSources.find((item) => item.key === status.sourceKey)
                || (status.sourceUrl ? {
                    key: status.sourceKey || 'restored-source',
                    label: status.sourceLabel || status.sourceKey || '恢复的代理源',
                    url: status.sourceUrl,
                    kind: 'profile',
                } : null)
                || status.availableSources[0];
            if (!source?.url) {
                this.setRecoveryState('failed', 'missing-source', new Error('内置代理缺少可恢复的代理源'));
                return;
            }
            this.setRecoveryState('recovering', 'guardian-restart');
            await this.startKernel({
                sourceKey: source.key,
                sourceUrl: source.url,
                sourceLabel: source.label,
                mixedPort: status.mixedPort,
                socksPort: status.socksPort,
                httpPort: status.httpPort,
            }).catch((error) => {
                this.setRecoveryState('failed', 'guardian-restart-failed', error);
                throw error;
            });
        })().finally(() => {
            this.guardPromise = null;
        });
        return this.guardPromise;
    }
    async ensureKernelRunningForOpenAi() {
        const status = await this.getStatus();
        if (status.running)
            return status;
        const source = status.availableSources.find((item) => item.key === status.sourceKey)
            || (status.sourceUrl ? {
                key: status.sourceKey || 'restored-source',
                label: status.sourceLabel || status.sourceKey || '恢复的代理源',
                url: status.sourceUrl,
                kind: 'profile',
            } : null)
            || status.availableSources[0];
        if (!source?.url) {
            this.setRecoveryState('failed', 'missing-source', new Error('内置代理未运行，且没有可用代理源'));
            throw new Error('内置代理未运行，且没有可用的 MiSub 分组或订阅来源可自动恢复');
        }
        logger_1.default.info(`Built-in proxy is down, auto-restarting with source ${source.label}`);
        this.setRecoveryState('recovering', 'openai-kernel-restart');
        return this.startKernel({
            sourceKey: source.key,
            sourceUrl: source.url,
            sourceLabel: source.label,
            mixedPort: status.mixedPort,
            socksPort: status.socksPort,
            httpPort: status.httpPort,
        }, { skipOpenAiCalibration: true });
    }
    async recoverKernelForOpenAi() {
        this.setRecoveryState('recovering', 'openai-hard-restart');
        await this.stopKernel({ preserveError: true }).catch((error) => {
            logger_1.default.warn(`Stop kernel during OpenAI recovery failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        await this.ensureKernelRunningForOpenAi();
    }
    bootstrapBundledBinary() {
        if (!fs_1.default.existsSync(this.bundledBinaryPath))
            return;
        const current = this.readState();
        if (current.binaryPath === this.bundledBinaryPath && current.installed)
            return;
        current.installed = true;
        current.binaryPath = this.bundledBinaryPath;
        current.updatedAt = current.updatedAt || new Date().toISOString();
        this.writeState(current);
    }
    async getAvailableSources() {
        const data = await this.getMiSubData();
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
    readMiSubSnapshot() {
        try {
            if (!fs_1.default.existsSync(this.snapshotFile))
                return null;
            const store = JSON.parse(fs_1.default.readFileSync(this.snapshotFile, 'utf8'));
            const candidates = Object.entries(store)
                .filter(([key, entry]) => key.startsWith('misub-summary:') && entry?.value)
                .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0));
            for (const [, entry] of candidates) {
                const value = entry.value;
                if (value?.connected && (value.misubs?.length || value.profiles?.length)) {
                    return value;
                }
            }
        }
        catch (error) {
            logger_1.default.warn(`Failed to read MiSub snapshot fallback: ${String(error)}`);
        }
        return null;
    }
    async killExistingKernelProcesses() {
        if (os_1.default.platform() !== 'win32')
            return;
        const pids = await this.findKernelProcessIds();
        for (const pid of pids) {
            await this.safeExecFile('taskkill', ['/PID', String(pid), '/F']).catch((error) => {
                logger_1.default.warn(`Failed to taskkill mihomo listener pid ${pid}: ${String(error)}`);
            });
        }
    }
    async findKernelProcessId() {
        const pids = await this.findKernelProcessIds().catch((error) => {
            logger_1.default.warn(`Unable to infer mihomo process id: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        });
        return pids[0] || null;
    }
    async findKernelProcessIds() {
        if (os_1.default.platform() !== 'win32') {
            const state = this.readState();
            return state.pid ? [state.pid] : [];
        }
        const state = this.readState();
        const ports = new Set([CONTROLLER_PORT, state.mixedPort, state.socksPort, state.httpPort].filter(Boolean));
        const pids = new Set();
        const result = await this.safeExecFile('netstat', ['-ano']).catch(() => null);
        const output = String(result?.stdout || '');
        for (const line of output.split(/\r?\n/)) {
            if (!/\bLISTENING\b/i.test(line))
                continue;
            const columns = line.trim().split(/\s+/);
            if (columns.length < 5)
                continue;
            const localAddress = columns[1] || '';
            const pid = Number(columns[columns.length - 1]);
            if (!Number.isFinite(pid) || pid <= 0)
                continue;
            for (const port of ports) {
                if (localAddress.endsWith(`:${port}`)) {
                    pids.add(pid);
                }
            }
        }
        const normalizedBinaryPath = this.bundledBinaryPath.replace(/\\/g, '\\\\');
        const normalizedWorkDir = this.workDir.replace(/\\/g, '\\\\');
        const psCommand = [
            "$rows = Get-CimInstance Win32_Process | Where-Object {",
            "  $_.Name -eq 'mihomo.exe' -and",
            `  $_.ExecutablePath -eq '${normalizedBinaryPath}' -and`,
            `  $_.CommandLine -like '*${normalizedWorkDir}*'`,
            "} | Select-Object ProcessId",
            "$rows | ConvertTo-Json -Compress",
        ].join(' ');
        const psResult = await this.safeExecFile('powershell', ['-NoProfile', '-Command', psCommand]).catch(() => null);
        const psOutput = String(psResult?.stdout || '').trim();
        if (psOutput) {
            try {
                const parsed = JSON.parse(psOutput);
                const rows = Array.isArray(parsed) ? parsed : [parsed];
                for (const row of rows) {
                    const pid = Number(row?.ProcessId);
                    if (Number.isFinite(pid) && pid > 0) {
                        pids.add(pid);
                    }
                }
            }
            catch (error) {
                logger_1.default.warn(`Failed to parse mihomo process list: ${String(error)}`);
            }
        }
        return Array.from(pids).sort((left, right) => left - right);
    }
    async safeExecFile(file, args) {
        try {
            return await execFileAsync(file, args);
        }
        catch (error) {
            throw error;
        }
    }
    async getMiSubData() {
        const record = this.getMiSubRecord();
        if (record) {
            return integrationService.fetchMiSubData(record).catch(() => this.readMiSubSnapshot());
        }
        return this.readMiSubSnapshot();
    }
    async buildKernelConfigYaml(payload) {
        const converter = this.normalizeConverterUrl(payload.miSubData?.settings?.subConverter || '');
        if (converter) {
            try {
                const converted = await this.fetchConvertedClashConfig({
                    converter,
                    sourceUrl: payload.sourceUrl,
                    configUrl: payload.miSubData?.settings?.subConfig || '',
                });
                return this.patchClashConfig(converted, payload.mixedPort, payload.socksPort, payload.httpPort);
            }
            catch (error) {
                logger_1.default.warn(`Converted Clash config failed, falling back to provider mode: ${String(error)}`);
            }
        }
        const providerFile = path_1.default.join(this.workDir, 'provider.yaml').replace(/\\/g, '/');
        return [
            `mixed-port: ${payload.mixedPort}`,
            `socks-port: ${payload.socksPort}`,
            `port: ${payload.httpPort}`,
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
            `    url: ${JSON.stringify(payload.sourceUrl)}`,
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
    }
    normalizeConverterUrl(value) {
        const trimmed = value.trim();
        if (!trimmed)
            return '';
        return /^https?:\/\//i.test(trimmed) ? trimmed.replace(/\/+$/, '') : `https://${trimmed.replace(/\/+$/, '')}`;
    }
    async fetchConvertedClashConfig(payload) {
        const url = new URL('/sub', payload.converter.endsWith('/') ? payload.converter : `${payload.converter}/`);
        url.searchParams.set('target', 'clash');
        url.searchParams.set('url', payload.sourceUrl);
        url.searchParams.set('insert', 'false');
        url.searchParams.set('emoji', 'true');
        url.searchParams.set('list', 'false');
        url.searchParams.set('xudp', 'false');
        url.searchParams.set('udp', 'true');
        url.searchParams.set('tfo', 'false');
        url.searchParams.set('scv', 'true');
        url.searchParams.set('fdn', 'false');
        url.searchParams.set('new_name', 'true');
        if (payload.configUrl) {
            url.searchParams.set('config', payload.configUrl);
        }
        const response = await fetch(url.toString(), {
            headers: { 'User-Agent': 'muse-mail' },
            redirect: 'follow',
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(text || `converter returned ${response.status}`);
        }
        if (!/proxy-groups:|proxies:/i.test(text)) {
            throw new Error('converted content is not a Clash config');
        }
        return text;
    }
    patchClashConfig(raw, mixedPort, socksPort, httpPort) {
        const normalized = raw.replace(/\r\n/g, '\n');
        const lines = normalized.split('\n');
        const topLevelKeys = new Set(['mixed-port', 'socks-port', 'port', 'allow-lan', 'bind-address', 'external-controller', 'log-level']);
        const filtered = lines.filter((line) => {
            if (/^\s/.test(line))
                return true;
            const key = line.split(':', 1)[0]?.trim();
            return !topLevelKeys.has(key);
        });
        return [
            `mixed-port: ${mixedPort}`,
            `socks-port: ${socksPort}`,
            `port: ${httpPort}`,
            'allow-lan: false',
            `external-controller: 127.0.0.1:${CONTROLLER_PORT}`,
            'log-level: info',
            ...filtered,
            '',
        ].join('\n');
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
    async launchKernelProcess(binaryPath) {
        if (os_1.default.platform() === 'win32') {
            let child;
            try {
                child = (0, child_process_1.spawn)(binaryPath, ['-d', this.workDir, '-f', this.configFile], {
                    cwd: this.workDir,
                    detached: true,
                    windowsHide: true,
                    stdio: 'ignore',
                });
            }
            catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                logger_1.default.warn(`mihomo spawn failed before process creation: ${detail}`);
                throw new Error(`启动 mihomo 进程失败：${detail}`);
            }
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    child.removeAllListeners('error');
                    resolve();
                }, 300);
                child.once('error', (error) => {
                    clearTimeout(timer);
                    reject(error);
                });
            });
            child.unref();
            this.child = null;
            return child.pid || null;
        }
        try {
            this.child = (0, child_process_1.spawn)(binaryPath, ['-d', this.workDir, '-f', this.configFile], {
                cwd: this.workDir,
                windowsHide: true,
                stdio: 'pipe',
            });
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            logger_1.default.warn(`mihomo spawn failed before process creation: ${detail}`);
            throw new Error(`启动 mihomo 进程失败：${detail}`);
        }
        this.child.stdout?.on('data', (chunk) => logger_1.default.info(`[mihomo] ${String(chunk).trim()}`));
        this.child.stderr?.on('data', (chunk) => logger_1.default.error(`[mihomo] ${String(chunk).trim()}`));
        this.child.once('exit', (code) => {
            logger_1.default.info(`mihomo exited with code ${code}`);
            const next = this.readState();
            next.running = false;
            next.pid = null;
            next.health = 'failed';
            next.recoveryState = 'process-exited';
            if (code && code !== 0) {
                next.lastError = `mihomo exited with code ${code}`;
                next.lastRecoveryError = next.lastError;
            }
            this.writeState(next);
            this.child = null;
        });
        this.child.once('error', (error) => {
            logger_1.default.error(`[mihomo] spawn error: ${String(error)}`);
            const next = this.readState();
            next.running = false;
            next.pid = null;
            next.health = 'failed';
            next.recoveryState = 'spawn-error';
            next.lastError = `spawn error: ${error instanceof Error ? error.message : String(error)}`;
            next.lastRecoveryError = next.lastError;
            this.writeState(next);
            this.child = null;
        });
        return this.child.pid || null;
    }
    async isKernelRunning(state) {
        const [mixedReady, controllerReady] = await Promise.all([
            this.isTcpPortOpen('127.0.0.1', state.mixedPort || 7890),
            this.isTcpPortOpen('127.0.0.1', CONTROLLER_PORT),
        ]);
        if (mixedReady || controllerReady) {
            return true;
        }
        const childAlive = !!(this.child && !this.child.killed);
        const pidAlive = !childAlive && state.pid ? this.isPidAlive(state.pid) : false;
        if (!childAlive && !pidAlive) {
            return false;
        }
        return mixedReady || controllerReady;
    }
    isPidAlive(pid) {
        if (!pid)
            return false;
        try {
            process.kill(pid, 0);
            return true;
        }
        catch {
            return false;
        }
    }
    isTcpPortOpen(host, port) {
        return new Promise((resolve) => {
            const socket = net_1.default.connect({ host, port });
            const done = (result) => {
                socket.removeAllListeners();
                socket.destroy();
                resolve(result);
            };
            socket.setTimeout(1200);
            socket.once('connect', () => done(true));
            socket.once('timeout', () => done(false));
            socket.once('error', () => done(false));
        });
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