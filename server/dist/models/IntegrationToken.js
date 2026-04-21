"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationTokenModel = void 0;
const database_1 = __importDefault(require("../database"));
class IntegrationTokenModel {
    get(provider) {
        return database_1.default.prepare('SELECT * FROM integration_tokens WHERE provider = ?').get(provider);
    }
    upsert(provider, token) {
        database_1.default.prepare(`
      INSERT INTO integration_tokens (provider, token, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(provider) DO UPDATE SET
        token = excluded.token,
        updated_at = CURRENT_TIMESTAMP
    `).run(provider, token);
        return this.get(provider);
    }
    delete(provider) {
        return database_1.default.prepare('DELETE FROM integration_tokens WHERE provider = ?').run(provider).changes > 0;
    }
}
exports.IntegrationTokenModel = IntegrationTokenModel;
//# sourceMappingURL=IntegrationToken.js.map