import app from './app';
import { config } from './config';
import { runMigrations } from './database/migrations';
import { agentAutonomyService } from './services/AgentAutonomyService';
import { miSubAiInspectionService } from './services/MiSubAiInspectionService';
import { personalMemoryIngestionService } from './services/PersonalMemoryIngestionService';
import { proxyKernelService } from './services/ProxyKernelService';
import { newspaperService } from './services/NewspaperService';
import { tokenAutoSyncService } from './services/TokenAutoSyncService';
import { crsRelayService } from './services/CrsRelayService';
import logger from './utils/logger';

// 初始化数据库
runMigrations();
logger.info('Database migrations completed');
miSubAiInspectionService.start();
logger.info('MiSub AI inspection scheduler started');
personalMemoryIngestionService.start();
logger.info('Personal memory ingestion scheduler started');
agentAutonomyService.start();
logger.info('Agent autonomy scheduler started');
tokenAutoSyncService.start();
logger.info('Token auto sync scheduler started');
proxyKernelService.startGuardian();
logger.info('mihomo guardian started');
newspaperService.startAutoWarm();
logger.info('Newspaper auto warm scheduler started');
try {
  const crs = crsRelayService.ensureRuntimeConfig(config.serverOrigin);
  logger.info(`CRS relay runtime ${crs.enabled ? 'enabled' : 'available'} with ${crs.candidateCount} candidates`);
} catch (error) {
  logger.warn(`CRS relay runtime sync skipped: ${error instanceof Error ? error.message : String(error)}`);
}
proxyKernelService.ensureKernelBootstrapped()
  .then((status) => {
    if (status?.running) {
      logger.info(`mihomo bootstrap completed on port ${status.mixedPort} with source ${status.sourceLabel || status.sourceKey}`);
    } else {
      logger.info('mihomo bootstrap finished without starting kernel');
    }
  })
  .catch((error) => {
    logger.warn(`mihomo bootstrap crashed: ${error instanceof Error ? error.message : String(error)}`);
  });

// 启动服务
const server = app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(
      `Server failed to start: port ${config.port} is already in use. `
      + `Muse/CRS may already be running; keep the existing process or start a separate instance with a different PORT.`
    );
  } else {
    logger.error(`Server failed to start: ${error.message}`);
  }

  process.exit(1);
});
