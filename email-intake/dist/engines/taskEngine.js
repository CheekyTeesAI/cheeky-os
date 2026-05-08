"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTaskFromSeoAction = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
/**
 * Bridge SEO actions → executable tasks (SeoGeneratedTask, not Order Task).
 */
const createTaskFromSeoAction = async (actionId) => {
    const action = await prisma_1.default.seoAction.findUnique({
        where: { id: actionId },
    });
    if (!action)
        return null;
    const task = await prisma_1.default.seoGeneratedTask.create({
        data: {
            seoActionId: action.id,
            orderRef: "SEO",
            type: action.type,
            status: "PENDING",
        },
    });
    return task;
};
exports.createTaskFromSeoAction = createTaskFromSeoAction;
