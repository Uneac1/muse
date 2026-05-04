import Router from 'koa-router';
import { NewspaperController } from '../controllers/NewspaperController';

export const newspaperRoutes = new Router();
const ctrl = new NewspaperController();

newspaperRoutes.get('/health', ctrl.health);
newspaperRoutes.get('/briefing', ctrl.briefing);
newspaperRoutes.get('/article/stream', ctrl.articleStream);
newspaperRoutes.get('/article', ctrl.article);
newspaperRoutes.post('/insight', ctrl.insight);
newspaperRoutes.post('/briefing-insight', ctrl.briefingInsight);
