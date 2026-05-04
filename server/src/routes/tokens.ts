import Router from 'koa-router';
import { TokenController } from '../controllers/TokenController';

export const tokenRoutes = new Router();
const ctrl = new TokenController();

tokenRoutes.get('/accounts', ctrl.listAccounts);
tokenRoutes.post('/accounts', ctrl.createAccount);
tokenRoutes.put('/accounts/:id', ctrl.updateAccount);
tokenRoutes.delete('/accounts/:id', ctrl.deleteAccount);
tokenRoutes.post('/accounts/:id/sync', ctrl.syncAccount);
tokenRoutes.post('/sync', ctrl.syncAll);
tokenRoutes.post('/auto-sync', ctrl.autoSync);
tokenRoutes.post('/codex/free/import', ctrl.importCodexFree);
