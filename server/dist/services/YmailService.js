"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.YmailService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const undici_1 = require("undici");
const config_1 = require("../config");
const snapshotCache_1 = require("../utils/snapshotCache");
const YMAIL_ADDRESS_PAGE_SIZE_MAX = 100;
const YMAIL_MAIL_PAGE_SIZE_MAX = 50;
class YmailService {
    cache = new Map();
    inflight = new Map();
    dispatcher = new undici_1.Agent({
        connect: {
            family: 4,
            rejectUnauthorized: false,
        },
    });
    fingerprint = crypto_1.default
        .createHash('sha256')
        .update('muse-mail-ymail')
        .digest('hex')
        .slice(0, 32);
    maskToken(token) {
        if (!token)
            return '';
        if (token.length <= 8)
            return `${token.slice(0, 2)}***`;
        return `${token.slice(0, 4)}...${token.slice(-4)}`;
    }
    sha256(value) {
        return crypto_1.default.createHash('sha256').update(value).digest('hex');
    }
    cacheKey(kind, token, suffix = '') {
        return `${kind}:${this.maskToken(token)}:${suffix}`;
    }
    getCached(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    setCached(key, value, ttlMs) {
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
    }
    async withCache(key, ttlMs, force, loader) {
        if (!force) {
            const cached = this.getCached(key);
            if (cached)
                return cached;
            const snapshot = (0, snapshotCache_1.getSnapshot)(key);
            if (snapshot)
                return this.setCached(key, snapshot, ttlMs);
            const inflight = this.inflight.get(key);
            if (inflight)
                return inflight;
        }
        const promise = loader()
            .then((value) => {
            (0, snapshotCache_1.setSnapshot)(key, value);
            return this.setCached(key, value, ttlMs);
        })
            .finally(() => {
            if (this.inflight.get(key) === promise) {
                this.inflight.delete(key);
            }
        });
        this.inflight.set(key, promise);
        return promise;
    }
    invalidateIntegrationData(record) {
        const key = this.cacheKey('ymail-summary', record.token);
        this.cache.delete(key);
        this.inflight.delete(key);
        (0, snapshotCache_1.deleteSnapshot)(key);
    }
    invalidateAddressMails(record, id) {
        const prefix = this.cacheKey('ymail-mails', record.token, `${id}:`);
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix))
                this.cache.delete(key);
        }
        for (const key of this.inflight.keys()) {
            if (key.startsWith(prefix))
                this.inflight.delete(key);
        }
        (0, snapshotCache_1.deleteSnapshotsByPrefix)(prefix);
    }
    buildHeaders(options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'x-lang': 'zh',
            'x-fingerprint': this.fingerprint,
        };
        if (options.adminPassword) {
            headers['x-admin-auth'] = options.adminPassword;
        }
        if (options.jwt) {
            headers.Authorization = `Bearer ${options.jwt}`;
        }
        return headers;
    }
    async request(path, options = {}) {
        const url = `${config_1.config.ymailApiBaseUrl}${path}`;
        const response = await (0, undici_1.fetch)(url, {
            dispatcher: this.dispatcher,
            method: options.method || 'GET',
            headers: this.buildHeaders(options),
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
        const text = await response.text();
        const contentType = response.headers.get('content-type') || '';
        const parsed = contentType.includes('application/json') && text
            ? JSON.parse(text)
            : this.tryParseJson(text);
        if (response.status >= 300) {
            const message = typeof parsed === 'string'
                ? parsed
                : parsed?.message || parsed?.error || text || response.statusText;
            throw new Error(`Ymail request failed: ${response.status} ${message}`);
        }
        return parsed;
    }
    tryParseJson(text) {
        if (!text)
            return null;
        try {
            return JSON.parse(text);
        }
        catch {
            return text;
        }
    }
    async fetchOpenSettings() {
        return this.request('/open_api/settings');
    }
    async validateAdminPassword(adminPassword) {
        await this.request('/open_api/admin_login', {
            method: 'POST',
            body: {
                password: this.sha256(adminPassword),
            },
        });
    }
    async fetchStatistics(adminPassword) {
        return this.request('/admin/statistics', { adminPassword });
    }
    async listAddresses(adminPassword, params = {}) {
        const limit = Math.max(1, Math.min(Math.trunc(params.limit ?? 50) || 50, YMAIL_ADDRESS_PAGE_SIZE_MAX));
        const offset = Math.max(0, Math.trunc(params.offset ?? 0) || 0);
        const search = new URLSearchParams();
        search.set('limit', String(limit));
        search.set('offset', String(offset));
        if (params.query)
            search.set('query', params.query);
        if (params.sortBy)
            search.set('sort_by', params.sortBy);
        if (params.sortOrder)
            search.set('sort_order', params.sortOrder);
        const result = await this.request(`/admin/address?${search.toString()}`, { adminPassword });
        return {
            results: Array.isArray(result?.results) ? result.results : [],
            count: Number(result?.count || 0),
        };
    }
    async createAddress(adminPassword, data) {
        const result = await this.request('/admin/new_address', {
            method: 'POST',
            adminPassword,
            body: {
                enablePrefix: data.enablePrefix ?? true,
                enableRandomSubdomain: data.enableRandomSubdomain ?? false,
                name: data.name,
                domain: data.domain,
            },
        });
        return {
            ...result,
            loginUrl: result?.jwt ? `${config_1.config.ymailSiteUrl}/?jwt=${encodeURIComponent(result.jwt)}` : '',
        };
    }
    async showAddressCredential(adminPassword, id) {
        const result = await this.request(`/admin/show_password/${id}`, { adminPassword });
        return {
            jwt: result.jwt,
            loginUrl: result?.jwt ? `${config_1.config.ymailSiteUrl}/?jwt=${encodeURIComponent(result.jwt)}` : '',
        };
    }
    async deleteAddress(adminPassword, id) {
        await this.request(`/admin/delete_address/${id}`, { method: 'DELETE', adminPassword });
    }
    async clearInbox(adminPassword, id) {
        await this.request(`/admin/clear_inbox/${id}`, { method: 'DELETE', adminPassword });
    }
    async clearSentItems(adminPassword, id) {
        await this.request(`/admin/clear_sent_items/${id}`, { method: 'DELETE', adminPassword });
    }
    async resetAddressPassword(adminPassword, id, password) {
        await this.request(`/admin/address/${id}/reset_password`, {
            method: 'POST',
            adminPassword,
            body: { password },
        });
    }
    async fetchMailboxSettings(jwt) {
        return this.request('/api/settings', { jwt });
    }
    async fetchAddressMails(jwt, params = {}) {
        const limit = Math.max(1, Math.min(Math.trunc(params.limit ?? 20) || 20, YMAIL_MAIL_PAGE_SIZE_MAX));
        const offset = Math.max(0, Math.trunc(params.offset ?? 0) || 0);
        const search = new URLSearchParams();
        search.set('limit', String(limit));
        search.set('offset', String(offset));
        const result = await this.request(`/api/mails?${search.toString()}`, { jwt });
        return {
            results: Array.isArray(result?.results) ? result.results : [],
            count: Number(result?.count || 0),
        };
    }
    async deleteMail(jwt, mailId) {
        await this.request(`/api/mails/${mailId}`, { method: 'DELETE', jwt });
    }
    async fetchAddressMailbox(record, id, params = {}, options) {
        const limit = Math.max(1, Math.min(Math.trunc(params.limit ?? 20) || 20, YMAIL_MAIL_PAGE_SIZE_MAX));
        const offset = Math.max(0, Math.trunc(params.offset ?? 0) || 0);
        return this.withCache(this.cacheKey('ymail-mails', record.token, `${id}:${limit}:${offset}`), 20 * 1000, !!options?.force, async () => {
            const credential = await this.showAddressCredential(record.token, id);
            const [mailbox, mails] = await Promise.all([
                this.fetchMailboxSettings(credential.jwt),
                this.fetchAddressMails(credential.jwt, { limit, offset }),
            ]);
            return {
                jwt: credential.jwt,
                address: mailbox?.address || '',
                ...mails,
            };
        });
    }
    async fetchIntegrationData(record, options) {
        return this.withCache(this.cacheKey('ymail-summary', record.token), 60 * 1000, !!options?.force, async () => {
            const [openSettings, statistics, addresses] = await Promise.all([
                this.fetchOpenSettings(),
                this.fetchStatistics(record.token),
                this.listAddresses(record.token, { limit: 50, offset: 0 }),
            ]);
            return {
                connected: true,
                tokenMasked: this.maskToken(record.token),
                lastSyncAt: record.updated_at,
                siteUrl: config_1.config.ymailSiteUrl,
                apiBaseUrl: config_1.config.ymailApiBaseUrl,
                openSettings,
                statistics,
                addresses: addresses.results,
                addressCount: addresses.count,
            };
        });
    }
}
exports.YmailService = YmailService;
//# sourceMappingURL=YmailService.js.map