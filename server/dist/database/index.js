"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeDatabase = closeDatabase;
exports.reopenDatabase = reopenDatabase;
exports.replaceDatabaseFile = replaceDatabaseFile;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const config_1 = require("../config");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dir = path_1.default.dirname(config_1.config.dbPath);
if (!fs_1.default.existsSync(dir)) {
    fs_1.default.mkdirSync(dir, { recursive: true });
}
function openDatabase(dbPath) {
    const database = new better_sqlite3_1.default(dbPath);
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    return database;
}
function removeSqliteSidecars(dbPath) {
    for (const suffix of ['-wal', '-shm']) {
        const sidecarPath = `${dbPath}${suffix}`;
        if (fs_1.default.existsSync(sidecarPath)) {
            fs_1.default.rmSync(sidecarPath, { force: true });
        }
    }
}
let currentDb = openDatabase(config_1.config.dbPath);
function closeDatabase() {
    if (currentDb.open) {
        currentDb.close();
    }
}
function reopenDatabase() {
    closeDatabase();
    currentDb = openDatabase(config_1.config.dbPath);
}
function replaceDatabaseFile(sourcePath) {
    closeDatabase();
    try {
        removeSqliteSidecars(config_1.config.dbPath);
        fs_1.default.copyFileSync(sourcePath, config_1.config.dbPath);
    }
    catch (error) {
        currentDb = openDatabase(config_1.config.dbPath);
        throw error;
    }
    currentDb = openDatabase(config_1.config.dbPath);
}
const db = new Proxy({}, {
    get(_target, prop) {
        const value = currentDb[prop];
        return typeof value === 'function' ? value.bind(currentDb) : value;
    },
});
exports.default = db;
//# sourceMappingURL=index.js.map