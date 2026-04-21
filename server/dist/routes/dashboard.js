"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const DashboardController_1 = require("../controllers/DashboardController");
exports.dashboardRoutes = new koa_router_1.default();
const ctrl = new DashboardController_1.DashboardController();
exports.dashboardRoutes.get('/stats', ctrl.stats);
//# sourceMappingURL=dashboard.js.map