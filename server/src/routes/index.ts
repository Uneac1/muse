import Router from 'koa-router';
import { accountRoutes } from './accounts';
import { mailRoutes } from './mails';
import { proxyRoutes } from './proxies';
import { dashboardRoutes } from './dashboard';
import { authRoutes } from './auth';
import { tagRoutes } from './tags';
import { backupRoutes } from './backup';
import { oauthRoutes } from './oauth';
import { integrationRoutes } from './integrations';
import { aiRoutes } from './ai';
import { tokenRoutes } from './tokens';
import { newspaperRoutes } from './newspaper';
import { osRoutes } from './os';

const router = new Router({ prefix: '/api' });

router.use('/accounts', accountRoutes.routes(), accountRoutes.allowedMethods());
router.use('/mails', mailRoutes.routes(), mailRoutes.allowedMethods());
router.use('/proxies', proxyRoutes.routes(), proxyRoutes.allowedMethods());
router.use('/dashboard', dashboardRoutes.routes(), dashboardRoutes.allowedMethods());
router.use('/auth', authRoutes.routes(), authRoutes.allowedMethods());
router.use('/tags', tagRoutes.routes(), tagRoutes.allowedMethods());
router.use('/backup', backupRoutes.routes(), backupRoutes.allowedMethods());
router.use('/oauth', oauthRoutes.routes(), oauthRoutes.allowedMethods());
router.use('/integrations', integrationRoutes.routes(), integrationRoutes.allowedMethods());
router.use('/ai', aiRoutes.routes(), aiRoutes.allowedMethods());
router.use('/tokens', tokenRoutes.routes(), tokenRoutes.allowedMethods());
router.use('/newspaper', newspaperRoutes.routes(), newspaperRoutes.allowedMethods());
router.use('/os', osRoutes.routes(), osRoutes.allowedMethods());

export default router;
