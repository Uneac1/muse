import Router from 'koa-router';
import { OpenTeamsController } from '../controllers/OpenTeamsController';

export const openTeamsRoutes = new Router();
const ctrl = new OpenTeamsController();

openTeamsRoutes.get('/status', ctrl.status);
openTeamsRoutes.post('/start', ctrl.start);
openTeamsRoutes.post('/stop', ctrl.stop);
