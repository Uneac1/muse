import Router from 'koa-router';
import { CrsRelayController } from '../controllers/CrsRelayController';

export const crsRoutes = new Router();
const ctrl = new CrsRelayController();

crsRoutes.get('/status', ctrl.status);
crsRoutes.put('/config', ctrl.update);
crsRoutes.post('/rotate-key', ctrl.rotateKey);
crsRoutes.post('/test', ctrl.test);
crsRoutes.all('/v1/(.*)', ctrl.proxy);
