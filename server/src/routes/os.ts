import Router from 'koa-router';
import { PersonalOSController } from '../controllers/PersonalOSController';

export const osRoutes = new Router();
const ctrl = new PersonalOSController();

osRoutes.get('/workspace', ctrl.workspace);
osRoutes.get('/search', ctrl.search);
osRoutes.get('/rules', ctrl.listRules);
osRoutes.post('/rules', ctrl.createRule);
osRoutes.put('/rules/:id', ctrl.updateRule);
osRoutes.delete('/rules/:id', ctrl.deleteRule);
osRoutes.post('/actions/state', ctrl.setActionState);
osRoutes.get('/memory', ctrl.listMemory);
osRoutes.post('/memory', ctrl.createMemory);
osRoutes.put('/memory/:id', ctrl.updateMemory);
osRoutes.delete('/memory/:id', ctrl.deleteMemory);
