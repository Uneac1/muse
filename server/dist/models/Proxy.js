"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyModel = void 0;
const database_1 = __importDefault(require("../database"));
class ProxyModel {
    list() {
        return database_1.default.prepare('SELECT * FROM proxies ORDER BY id DESC').all();
    }
    getById(id) {
        return database_1.default.prepare('SELECT * FROM proxies WHERE id = ?').get(id);
    }
    getDefault() {
        return database_1.default.prepare('SELECT * FROM proxies WHERE is_default = 1 AND is_enabled = 1 LIMIT 1').get();
    }
    create(data) {
        const stmt = database_1.default.prepare('INSERT INTO proxies (name, type, host, port, username, password, is_default, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        const result = stmt.run(data.name || '', data.type, data.host, data.port, data.username || '', data.password || '', data.is_default ? 1 : 0, data.is_enabled === false ? 0 : 1);
        return this.getById(result.lastInsertRowid);
    }
    update(id, data) {
        const fields = [];
        const values = [];
        for (const [key, val] of Object.entries(data)) {
            if (['name', 'type', 'host', 'port', 'username', 'password', 'is_default', 'is_enabled'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(key === 'is_default' || key === 'is_enabled' ? (val ? 1 : 0) : val);
            }
        }
        if (fields.length === 0)
            return this.getById(id);
        values.push(id);
        database_1.default.prepare(`UPDATE proxies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.getById(id);
    }
    delete(id) {
        return database_1.default.prepare('DELETE FROM proxies WHERE id = ?').run(id).changes > 0;
    }
    setDefault(id) {
        database_1.default.prepare('UPDATE proxies SET is_default = 0').run();
        database_1.default.prepare('UPDATE proxies SET is_default = 1, is_enabled = 1 WHERE id = ?').run(id);
        return this.getById(id);
    }
    setEnabled(id, enabled) {
        database_1.default.prepare('UPDATE proxies SET is_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
        return this.getById(id);
    }
    updateTestResult(id, ip, status) {
        database_1.default.prepare('UPDATE proxies SET last_tested_at = CURRENT_TIMESTAMP, last_test_ip = ?, status = ? WHERE id = ?').run(ip, status, id);
    }
}
exports.ProxyModel = ProxyModel;
//# sourceMappingURL=Proxy.js.map