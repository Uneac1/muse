import Router from 'koa-router';
import { ProxyKernelController } from '../controllers/ProxyKernelController';

export const proxyKernelRoutes = new Router();
const ctrl = new ProxyKernelController();

proxyKernelRoutes.get('/', ctrl.status);
proxyKernelRoutes.get('/status', ctrl.status);
proxyKernelRoutes.post('/download', ctrl.download);
proxyKernelRoutes.post('/start', ctrl.start);
proxyKernelRoutes.post('/stop', ctrl.stop);
proxyKernelRoutes.post('/select', ctrl.select);
proxyKernelRoutes.post('/test-openai', ctrl.testOpenAi);
