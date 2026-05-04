import db from '../database';
import { Tag } from '../types';

export class TagModel {
  list(): Tag[] {
    return db.prepare('SELECT * FROM tags ORDER BY name').all() as Tag[];
  }

  getById(id: number): Tag | undefined {
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag | undefined;
  }

  create(name: string, color = '#3B82F6'): Tag {
    const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color);
    return this.getById(result.lastInsertRowid as number)!;
  }

  update(id: number, data: { name?: string; color?: string }): Tag | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  delete(id: number): boolean {
    const result = db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getTagsByAccountId(accountId: number): Tag[] {
    return db.prepare(`
      SELECT t.* FROM tags t
      JOIN account_tags at ON t.id = at.tag_id
      WHERE at.account_id = ?
      ORDER BY t.name
    `).all(accountId) as Tag[];
  }

  getTagsByAccountIds(accountIds: number[]): Record<number, Tag[]> {
    const ids = [...new Set(accountIds.filter((id) => Number.isFinite(id) && id > 0))];
    if (!ids.length) return {};

    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT at.account_id as account_id, t.*
      FROM account_tags at
      JOIN tags t ON t.id = at.tag_id
      WHERE at.account_id IN (${placeholders})
      ORDER BY at.account_id, t.name
    `).all(...ids) as Array<Tag & { account_id: number }>;

    return rows.reduce<Record<number, Tag[]>>((acc, row) => {
      const { account_id, ...tag } = row;
      (acc[account_id] ||= []).push(tag);
      return acc;
    }, {});
  }

  setAccountTags(accountId: number, tagIds: number[]): void {
    const del = db.prepare('DELETE FROM account_tags WHERE account_id = ?');
    const ins = db.prepare('INSERT OR IGNORE INTO account_tags (account_id, tag_id) VALUES (?, ?)');
    const transaction = db.transaction(() => {
      del.run(accountId);
      for (const tagId of tagIds) {
        ins.run(accountId, tagId);
      }
    });
    transaction();
  }
}
