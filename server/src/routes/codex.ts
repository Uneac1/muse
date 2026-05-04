import Router from 'koa-router';
import { CodexController } from '../controllers/CodexController';

export const codexRoutes = new Router();
const ctrl = new CodexController();

codexRoutes.get('/desktop/status', ctrl.status);
codexRoutes.post('/desktop/activate', ctrl.activate);
codexRoutes.post('/desktop/rotate', ctrl.rotate);
codexRoutes.post('/desktop/auto-switch/check', ctrl.autoSwitchCheck);
codexRoutes.post('/desktop/restore', ctrl.restore);
codexRoutes.get('/settings', ctrl.getSettings);
codexRoutes.put('/settings', ctrl.updateSettings);
codexRoutes.get('/usage/history', ctrl.history);
