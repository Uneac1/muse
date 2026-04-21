import Router from 'koa-router';
import { OAuthController } from '../controllers/OAuthController';

export const oauthRoutes = new Router();
const ctrl = new OAuthController();

oauthRoutes.post('/openai/authorize', ctrl.authorizeOpenAI);
oauthRoutes.get('/openai/callback', ctrl.openaiCallback);
oauthRoutes.post('/google/authorize', ctrl.authorizeGoogle);
oauthRoutes.get('/google/callback', ctrl.googleCallback);
