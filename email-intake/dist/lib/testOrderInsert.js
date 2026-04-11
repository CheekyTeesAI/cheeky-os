"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testCreateOrder = testCreateOrder;
const prisma_1 = __importDefault(require("./prisma"));
async function testCreateOrder() {
    const order = await prisma_1.default.order.create({
        data: {
            customerName: "Test Customer",
            email: "test@example.com",
            phone: "555-0100",
            notes: "Prisma smoke test order",
            status: "INTAKE",
            quotedAmount: 100,
            estimatedCost: 40,
            margin: 60,
            quantity: 12,
            garmentType: "Tee",
            printMethod: "DTG",
            isApproved: false,
            depositReceived: false,
        },
    });
    console.log("Created order:", order);
    return order;
}
