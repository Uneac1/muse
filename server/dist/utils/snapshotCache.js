"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSnapshot = getSnapshot;
exports.setSnapshot = setSnapshot;
exports.deleteSnapshot = deleteSnapshot;
exports.deleteSnapshotsByPrefix = deleteSnapshotsByPrefix;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const snapshotPath = path_1.default.resolve(process.cwd(), 'data', 'integration-snapshots.json');
function readStore() {
    try {
        if (!fs_1.default.existsSync(snapshotPath))
            return {};
        return JSON.parse(fs_1.default.readFileSync(snapshotPath, 'utf8'));
    }
    catch {
        return {};
    }
}
function writeStore(store) {
    try {
        fs_1.default.mkdirSync(path_1.default.dirname(snapshotPath), { recursive: true });
        fs_1.default.writeFileSync(snapshotPath, JSON.stringify(store), 'utf8');
    }
    catch {
        // Snapshot persistence is an optimization. Never fail the request because of it.
    }
}
function getSnapshot(key, maxAgeMs) {
    const entry = readStore()[key];
    if (!entry || Date.now() - entry.updatedAt > maxAgeMs)
        return null;
    return entry.value;
}
function setSnapshot(key, value) {
    const store = readStore();
    store[key] = { value, updatedAt: Date.now() };
    writeStore(store);
}
function deleteSnapshot(key) {
    const store = readStore();
    delete store[key];
    writeStore(store);
}
function deleteSnapshotsByPrefix(prefix) {
    const store = readStore();
    for (const key of Object.keys(store)) {
        if (key.startsWith(prefix))
            delete store[key];
    }
    writeStore(store);
}
//# sourceMappingURL=snapshotCache.js.map