"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagRoutes = void 0;
const koa_router_1 = __importDefault(require("koa-router"));
const TagController_1 = require("../controllers/TagController");
exports.tagRoutes = new koa_router_1.default();
const ctrl = new TagController_1.TagController();
exports.tagRoutes.get('/', ctrl.list);
exports.tagRoutes.post('/', ctrl.create);
exports.tagRoutes.put('/:id', ctrl.update);
exports.tagRoutes.delete('/:id', ctrl.delete);
//# sourceMappingURL=tags.js.map