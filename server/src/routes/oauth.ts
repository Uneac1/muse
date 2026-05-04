import Router from 'koa-router';
import { OAuthController } from '../controllers/OAuthController';

export const oauthRoutes = new Router();
const ctrl = new OAuthController();

oauthRoutes.get('/status', (ctx) => ctrl.getStatus(ctx));
oauthRoutes.post('/linuxdo/authorize', (ctx) => ctrl.authorizeLinuxDo(ctx));
oauthRoutes.get('/linuxdo/callback', (ctx) => ctrl.linuxDoCallback(ctx));
oauthRoutes.post('/openai/authorize', (ctx) => ctrl.authorizeOpenAI(ctx));
oauthRoutes.post('/openai/launch', (ctx) => ctrl.launchOpenAI(ctx));
oauthRoutes.post('/openai/reset-session', (ctx) => ctrl.resetOpenAISession(ctx));
oauthRoutes.get('/openai/result', (ctx) => ctrl.openaiResult(ctx));
oauthRoutes.get('/openai/callback', (ctx) => ctrl.openaiCallback(ctx));
oauthRoutes.post('/google/authorize', (ctx) => ctrl.authorizeGoogle(ctx));
oauthRoutes.get('/google/callback', (ctx) => ctrl.googleCallback(ctx));
