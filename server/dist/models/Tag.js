"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TagModel = void 0;
const database_1 = __importDefault(require("../database"));
class TagModel {
    list() {
        return database_1.default.prepare('SELECT * FROM tags ORDER BY name').all();
    }
    getById(id) {
        return database_1.default.prepare('SELECT * FROM tags WHERE id = ?').get(id);
    }
    create(name, color = '#3B82F6') {
        const result = database_1.default.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color);
        return this.getById(result.lastInsertRowid);
    }
    update(id, data) {
        const fields = [];
        const values = [];
        if (data.name !== undefined) {
            fields.push('name = ?');
            values.push(data.name);
        }
        if (data.color !== undefined) {
            fields.push('color = ?');
            values.push(data.color);
        }
        if (fields.length === 0)
            return this.getById(id);
        values.push(id);
        database_1.default.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.getById(id);
    }
    delete(id) {
        const result = database_1.default.prepare('DELETE FROM tags WHERE id = ?').run(id);
        return result.changes > 0;
    }
    getTagsByAccountId(accountId) {
        return database_1.default.prepare(`
      SELECT t.* FROM tags t
      JOIN account_tags at ON t.id = at.tag_id
      WHERE at.account_id = ?
      ORDER BY t.name
    `).all(accountId);
    }
    getTagsByAccountIds(accountIds) {
        const ids = [...new Set(accountIds.filter((id) => Number.isFinite(id) && id > 0))];
        if (!ids.length)
            return {};
        const placeholders = ids.map(() => '?').join(',');
        const rows = database_1.default.prepare(`
      SELECT at.account_id as account_id, t.*
      FROM account_tags at
      JOIN tags t ON t.id = at.tag_id
      WHERE at.account_id IN (${placeholders})
      ORDER BY at.account_id, t.name
    `).all(...ids);
        return rows.reduce((acc, row) => {
            const { account_id, ...tag } = row;
            (acc[account_id] ||= []).push(tag);
            return acc;
        }, {});
    }
    setAccountTags(accountId, tagIds) {
        const del = database_1.default.prepare('DELETE FROM account_tags WHERE account_id = ?');
        const ins = database_1.default.prepare('INSERT OR IGNORE INTO account_tags (account_id, tag_id) VALUES (?, ?)');
        const transaction = database_1.default.transaction(() => {
            del.run(accountId);
            for (const tagId of tagIds) {
                ins.run(accountId, tagId);
            }
        });
        transaction();
    }
}
exports.TagModel = TagModel;
//# sourceMappingURL=Tag.js.map