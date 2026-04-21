"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const DashboardService_1 = require("../services/DashboardService");
const response_1 = require("../utils/response");
const dashboardService = new DashboardService_1.DashboardService();
class DashboardController {
    async stats(ctx) {
        const data = dashboardService.getStats();
        (0, response_1.success)(ctx, data);
    }
}
exports.DashboardController = DashboardController;
//# sourceMappingURL=DashboardController.js.map