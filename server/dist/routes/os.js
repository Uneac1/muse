"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.osRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const PersonalOSController_1 = require("../controllers/PersonalOSController");
exports.osRoutes = new koa_router_1.default();
const ctrl = new PersonalOSController_1.PersonalOSController();
exports.osRoutes.get('/workspace', ctrl.workspace);
exports.osRoutes.get('/search', ctrl.search);
exports.osRoutes.get('/rules', ctrl.listRules);
exports.osRoutes.post('/rules', ctrl.createRule);
exports.osRoutes.put('/rules/:id', ctrl.updateRule);
exports.osRoutes.delete('/rules/:id', ctrl.deleteRule);
exports.osRoutes.post('/actions/state', ctrl.setActionState);
exports.osRoutes.get('/memory', ctrl.listMemory);
exports.osRoutes.post('/memory', ctrl.createMemory);
exports.osRoutes.put('/memory/:id', ctrl.updateMemory);
exports.osRoutes.delete('/memory/:id', ctrl.deleteMemory);
//# sourceMappingURL=os.js.map