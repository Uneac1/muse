import Router from 'koa-router';
import { ProxyKernelController } from '../controllers/ProxyKernelController';

export const proxyKernelRoutes = new Router();
const ctrl = new ProxyKernelController();

proxyKernelRoutes.get('/', ctrl.status);
proxyKernelRoutes.post('/download', ctrl.download);
proxyKernelRoutes.post('/start', ctrl.start);
proxyKernelRoutes.post('/stop', ctrl.stop);
