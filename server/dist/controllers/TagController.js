"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TagController = void 0;
const Tag_1 = require("../models/Tag");
const response_1 = require("../utils/response");
const model = new Tag_1.TagModel();
class TagController {
    async list(ctx) {
        (0, response_1.success)(ctx, model.list());
    }
    async create(ctx) {
        const { name, color } = ctx.request.body;
        if (!name)
            return (0, response_1.fail)(ctx, 'name is required', 400);
        try {
            const tag = model.create(name, color);
            (0, response_1.success)(ctx, tag);
        }
        catch (err) {
            if (err.message?.includes('UNIQUE'))
                return (0, response_1.fail)(ctx, 'Tag already exists', 409);
            throw err;
        }
    }
    async update(ctx) {
        const id = parseInt(ctx.params.id);
        const tag = model.update(id, ctx.request.body);
        if (!tag)
            return (0, response_1.fail)(ctx, 'Tag not found', 404);
        (0, response_1.success)(ctx, tag);
    }
    async delete(ctx) {
        const id = parseInt(ctx.params.id);
        if (!model.delete(id))
            return (0, response_1.fail)(ctx, 'Tag not found', 404);
        (0, response_1.success)(ctx, { deleted: true });
    }
}
exports.TagController = TagController;
//# sourceMappingURL=TagController.js.map