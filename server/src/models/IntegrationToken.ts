import db from '../database';
import { IntegrationProvider, IntegrationTokenRecord } from '../types';

export class IntegrationTokenModel {
  get(provider: IntegrationProvider): IntegrationTokenRecord | undefined {
    return db.prepare('SELECT * FROM integration_tokens WHERE provider = ?').get(provider) as IntegrationTokenRecord | undefined;
  }

  upsert(provider: IntegrationProvider, token: string): IntegrationTokenRecord {
    db.prepare(`
      INSERT INTO integration_tokens (provider, token, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(provider) DO UPDATE SET
        token = excluded.token,
        updated_at = CURRENT_TIMESTAMP
    `).run(provider, token);

    return this.get(provider)!;
  }

  delete(provider: IntegrationProvider): boolean {
    return db.prepare('DELETE FROM integration_tokens WHERE provider = ?').run(provider).changes > 0;
  }
}
