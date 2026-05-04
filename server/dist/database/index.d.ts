import { Database as DatabaseType } from 'better-sqlite3';
export declare function closeDatabase(): void;
export declare function reopenDatabase(): void;
export declare function replaceDatabaseFile(sourcePath: string): void;
declare const db: DatabaseType;
export default db;
//# sourceMappingURL=index.d.ts.map