import Router from 'koa-router';
import { NewspaperController } from '../controllers/NewspaperController';

export const newspaperRoutes = new Router();
const ctrl = new NewspaperController();

newspaperRoutes.get('/briefing', ctrl.briefing);
newspaperRoutes.get('/article', ctrl.article);
