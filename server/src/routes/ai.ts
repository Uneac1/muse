import Router from 'koa-router';
import { AiController } from '../controllers/AiController';

export const aiRoutes = new Router();
const ctrl = new AiController();

aiRoutes.get('/accounts', ctrl.listAccounts);
aiRoutes.post('/accounts', ctrl.createAccount);
aiRoutes.get('/accounts/:id', ctrl.getAccountDiagnostics);
aiRoutes.post('/accounts/:id/test', ctrl.testAccount);
aiRoutes.put('/accounts/:id', ctrl.updateAccount);
aiRoutes.delete('/accounts/:id', ctrl.deleteAccount);
aiRoutes.get('/threads', ctrl.listThreads);
aiRoutes.get('/threads/:id/messages', ctrl.getMessages);
aiRoutes.put('/threads/:id', ctrl.updateThread);
aiRoutes.delete('/threads/:id', ctrl.deleteThread);
aiRoutes.delete('/accounts/:id/threads', ctrl.clearThreads);
aiRoutes.post('/accounts/:id/chat', ctrl.chat);
