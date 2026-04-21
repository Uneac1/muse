import Router from 'koa-router';
import { IntegrationController } from '../controllers/IntegrationController';

export const integrationRoutes = new Router();
const ctrl = new IntegrationController();

integrationRoutes.get('/github', ctrl.getGitHub);
integrationRoutes.post('/github/connect', ctrl.connectGitHub);
integrationRoutes.post('/github/sync', ctrl.syncGitHub);
integrationRoutes.delete('/github', ctrl.disconnectGitHub);

integrationRoutes.get('/cloudflare', ctrl.getCloudflare);
integrationRoutes.post('/cloudflare/connect', ctrl.connectCloudflare);
integrationRoutes.post('/cloudflare/sync', ctrl.syncCloudflare);
integrationRoutes.delete('/cloudflare', ctrl.disconnectCloudflare);

integrationRoutes.get('/notion', ctrl.getNotion);
integrationRoutes.post('/notion/connect', ctrl.connectNotion);
integrationRoutes.post('/notion/sync', ctrl.syncNotion);
integrationRoutes.get('/notion/insights', ctrl.getNotionInsights);
integrationRoutes.get('/notion/pages/:pageId/content', ctrl.getNotionPageContent);
integrationRoutes.get('/notion/databases/:databaseId/content', ctrl.getNotionDatabaseContent);
integrationRoutes.patch('/notion/blocks/:blockId', ctrl.updateNotionBlock);
integrationRoutes.delete('/notion', ctrl.disconnectNotion);

integrationRoutes.get('/misub', ctrl.getMiSub);
integrationRoutes.post('/misub/connect', ctrl.connectMiSub);
integrationRoutes.post('/misub/sync', ctrl.syncMiSub);
integrationRoutes.post('/misub/data', ctrl.saveMiSubData);
integrationRoutes.post('/misub/settings', ctrl.saveMiSubSettings);
integrationRoutes.post('/misub/node-count', ctrl.updateMiSubNodeCount);
integrationRoutes.post('/misub/batch-update-nodes', ctrl.batchUpdateMiSubNodes);
integrationRoutes.delete('/misub', ctrl.disconnectMiSub);

integrationRoutes.get('/ymail', ctrl.getYmail);
integrationRoutes.post('/ymail/connect', ctrl.connectYmail);
integrationRoutes.post('/ymail/sync', ctrl.syncYmail);
integrationRoutes.get('/ymail/addresses', ctrl.listYmailAddresses);
integrationRoutes.post('/ymail/addresses', ctrl.createYmailAddress);
integrationRoutes.get('/ymail/addresses/:id/credential', ctrl.getYmailAddressCredential);
integrationRoutes.get('/ymail/addresses/:id/mails', ctrl.getYmailAddressMails);
integrationRoutes.delete('/ymail/addresses/:id/mails/:mailId', ctrl.deleteYmailMail);
integrationRoutes.delete('/ymail/addresses/:id/inbox', ctrl.clearYmailInbox);
integrationRoutes.delete('/ymail/addresses/:id/sent', ctrl.clearYmailSent);
integrationRoutes.post('/ymail/addresses/:id/reset-password', ctrl.resetYmailAddressPassword);
integrationRoutes.delete('/ymail/addresses/:id', ctrl.deleteYmailAddress);
integrationRoutes.delete('/ymail', ctrl.disconnectYmail);
