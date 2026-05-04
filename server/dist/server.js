"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const migrations_1 = require("./database/migrations");
const AgentAutonomyService_1 = require("./services/AgentAutonomyService");
const MiSubAiInspectionService_1 = require("./services/MiSubAiInspectionService");
const PersonalMemoryIngestionService_1 = require("./services/PersonalMemoryIngestionService");
const ProxyKernelService_1 = require("./services/ProxyKernelService");
const NewspaperService_1 = require("./services/NewspaperService");
const TokenAutoSyncService_1 = require("./services/TokenAutoSyncService");
const CrsRelayService_1 = require("./services/CrsRelayService");
const logger_1 = __importDefault(require("./utils/logger"));
// 初始化数据库
(0, migrations_1.runMigrations)();
logger_1.default.info('Database migrations completed');
MiSubAiInspectionService_1.miSubAiInspectionService.start();
logger_1.default.info('MiSub AI inspection scheduler started');
PersonalMemoryIngestionService_1.personalMemoryIngestionService.start();
logger_1.default.info('Personal memory ingestion scheduler started');
AgentAutonomyService_1.agentAutonomyService.start();
logger_1.default.info('Agent autonomy scheduler started');
TokenAutoSyncService_1.tokenAutoSyncService.start();
logger_1.default.info('Token auto sync scheduler started');
ProxyKernelService_1.proxyKernelService.startGuardian();
logger_1.default.info('mihomo guardian started');
NewspaperService_1.newspaperService.startAutoWarm();
logger_1.default.info('Newspaper auto warm scheduler started');
try {
    const crs = CrsRelayService_1.crsRelayService.ensureRuntimeConfig(config_1.config.serverOrigin);
    logger_1.default.info(`CRS relay runtime ${crs.enabled ? 'enabled' : 'available'} with ${crs.candidateCount} candidates`);
}
catch (error) {
    logger_1.default.warn(`CRS relay runtime sync skipped: ${error instanceof Error ? error.message : String(error)}`);
}
ProxyKernelService_1.proxyKernelService.ensureKernelBootstrapped()
    .then((status) => {
    if (status?.running) {
        logger_1.default.info(`mihomo bootstrap completed on port ${status.mixedPort} with source ${status.sourceLabel || status.sourceKey}`);
    }
    else {
        logger_1.default.info('mihomo bootstrap finished without starting kernel');
    }
})
    .catch((error) => {
    logger_1.default.warn(`mihomo bootstrap crashed: ${error instanceof Error ? error.message : String(error)}`);
});
// 启动服务
const server = app_1.default.listen(config_1.config.port, () => {
    logger_1.default.info(`Server is running on port ${config_1.config.port}`);
});
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        logger_1.default.error(`Server failed to start: port ${config_1.config.port} is already in use. `
            + `Muse/CRS may already be running; keep the existing process or start a separate instance with a different PORT.`);
    }
    else {
        logger_1.default.error(`Server failed to start: ${error.message}`);
    }
    process.exit(1);
});
//# sourceMappingURL=server.js.map