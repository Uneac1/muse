import db from '../database';
import type { PersonalActionState, PersonalMemory, PersonalMemoryView, PersonalOsRule, PersonalOsRuleView } from '../types';

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value || '') as T;
  } catch {
    return fallback;
  }
}

export class PersonalOsRuleModel {
  list(): PersonalOsRuleView[] {
    return db
      .prepare('SELECT * FROM personal_os_rules ORDER BY is_enabled DESC, updated_at DESC, id DESC')
      .all()
      .map((row) => this.toView(row as PersonalOsRule));
  }

  getById(id: number): PersonalOsRuleView | undefined {
    const row = db.prepare('SELECT * FROM personal_os_rules WHERE id = ?').get(id) as PersonalOsRule | undefined;
    return row ? this.toView(row) : undefined;
  }

  create(data: Partial<PersonalOsRuleView>): PersonalOsRuleView {
    const result = db.prepare(`
      INSERT INTO personal_os_rules (name, description, scope, trigger_type, config_json, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.name || '新规则',
      data.description || '',
      data.scope || 'inbox',
      data.trigger_type || 'account_error',
      JSON.stringify(data.config || {}),
      data.is_enabled ?? 1
    );

    return this.getById(result.lastInsertRowid as number)!;
  }

  update(id: number, data: Partial<PersonalOsRuleView>): PersonalOsRuleView | undefined {
    const current = this.getById(id);
    if (!current) return undefined;

    db.prepare(`
      UPDATE personal_os_rules
      SET
        name = ?,
        description = ?,
        scope = ?,
        trigger_type = ?,
        config_json = ?,
        is_enabled = ?,
        last_triggered_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.name ?? current.name,
      data.description ?? current.description,
      data.scope ?? current.scope,
      data.trigger_type ?? current.trigger_type,
      JSON.stringify(data.config ?? current.config),
      data.is_enabled ?? current.is_enabled,
      data.last_triggered_at ?? current.last_triggered_at,
      id
    );

    return this.getById(id);
  }

  delete(id: number): boolean {
    return db.prepare('DELETE FROM personal_os_rules WHERE id = ?').run(id).changes > 0;
  }

  markTriggered(id: number) {
    db.prepare('UPDATE personal_os_rules SET last_triggered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  private toView(row: PersonalOsRule): PersonalOsRuleView {
    const { config_json, ...rest } = row;
    return {
      ...rest,
      config: parseJson<Record<string, any>>(config_json, {}),
    };
  }
}

export class PersonalActionStateModel {
  list(): PersonalActionState[] {
    return db.prepare('SELECT * FROM personal_action_states ORDER BY updated_at DESC').all() as PersonalActionState[];
  }

  mapByActionId() {
    return new Map(this.list().map((item) => [item.action_id, item]));
  }

  upsert(actionId: string, status: PersonalActionState['status'], note = ''): PersonalActionState {
    db.prepare(`
      INSERT INTO personal_action_states (action_id, status, note, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(action_id) DO UPDATE SET
        status = excluded.status,
        note = excluded.note,
        updated_at = CURRENT_TIMESTAMP
    `).run(actionId, status, note);

    return db.prepare('SELECT * FROM personal_action_states WHERE action_id = ?').get(actionId) as PersonalActionState;
  }

  clear(actionId: string): boolean {
    return db.prepare('DELETE FROM personal_action_states WHERE action_id = ?').run(actionId).changes > 0;
  }
}

export class PersonalMemoryModel {
  list(): PersonalMemoryView[] {
    return db
      .prepare('SELECT * FROM personal_memory ORDER BY is_pinned DESC, updated_at DESC, id DESC')
      .all()
      .map((row) => this.toView(row as PersonalMemory));
  }

  getById(id: number): PersonalMemoryView | undefined {
    const row = db.prepare('SELECT * FROM personal_memory WHERE id = ?').get(id) as PersonalMemory | undefined;
    return row ? this.toView(row) : undefined;
  }

  create(data: Partial<PersonalMemoryView>): PersonalMemoryView {
    const result = db.prepare(`
      INSERT INTO personal_memory (
        title, content, kind, tags_json, source, entity_type, entity_key, is_pinned, is_resolved, last_reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.title || '新记忆',
      data.content || '',
      data.kind || 'note',
      JSON.stringify(data.tags || []),
      data.source || 'manual',
      data.entity_type || '',
      data.entity_key || '',
      data.is_pinned ?? 0,
      data.is_resolved ?? 0,
      data.last_reviewed_at || null
    );

    return this.getById(result.lastInsertRowid as number)!;
  }

  update(id: number, data: Partial<PersonalMemoryView>): PersonalMemoryView | undefined {
    const current = this.getById(id);
    if (!current) return undefined;

    db.prepare(`
      UPDATE personal_memory
      SET
        title = ?,
        content = ?,
        kind = ?,
        tags_json = ?,
        source = ?,
        entity_type = ?,
        entity_key = ?,
        is_pinned = ?,
        is_resolved = ?,
        last_reviewed_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.title ?? current.title,
      data.content ?? current.content,
      data.kind ?? current.kind,
      JSON.stringify(data.tags ?? current.tags),
      data.source ?? current.source,
      data.entity_type ?? current.entity_type,
      data.entity_key ?? current.entity_key,
      data.is_pinned ?? current.is_pinned,
      data.is_resolved ?? current.is_resolved,
      data.last_reviewed_at ?? current.last_reviewed_at,
      id
    );

    return this.getById(id);
  }

  delete(id: number): boolean {
    return db.prepare('DELETE FROM personal_memory WHERE id = ?').run(id).changes > 0;
  }

  private toView(row: PersonalMemory): PersonalMemoryView {
    const { tags_json, ...rest } = row;
    return {
      ...rest,
      tags: parseJson<string[]>(tags_json, []),
    };
  }
}
