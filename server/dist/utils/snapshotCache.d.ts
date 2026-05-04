export declare function getSnapshot<T>(key: string, maxAgeMs?: number): T | null;
export declare function setSnapshot<T>(key: string, value: T): void;
export declare function deleteSnapshot(key: string): void;
export declare function deleteSnapshotsByPrefix(prefix: string): void;
//# sourceMappingURL=snapshotCache.d.ts.map