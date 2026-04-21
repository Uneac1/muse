"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const migrations_1 = require("./database/migrations");
const logger_1 = __importDefault(require("./utils/logger"));
// 初始化数据库
(0, migrations_1.runMigrations)();
logger_1.default.info('Database migrations completed');
// 启动服务
app_1.default.listen(config_1.config.port, () => {
    logger_1.default.info(`Server is running on port ${config_1.config.port}`);
});
//# sourceMappingURL=server.js.map