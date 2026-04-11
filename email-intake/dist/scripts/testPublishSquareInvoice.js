"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("../db/client");
const squareInvoicePublishService_1 = require("../services/squareInvoicePublishService");
async function main() {
    let order = await client_1.db.order.findFirst({
        where: {
            isApproved: true,
            squareInvoicePublished: false,
            squareInvoiceId: { not: null },
            status: "INVOICE_DRAFTED",
        },
    });
    if (!order) {
        order = await client_1.db.order.findFirst({
            where: {
                isApproved: true,
                squareInvoicePublished: false,
                squareInvoiceId: { not: null },
            },
        });
    }
    if (!order) {
        console.error("No candidate order found. Need: isApproved=true, squareInvoiceId set, squareInvoicePublished=false, status=INVOICE_DRAFTED (recommended). Create draft via POST /api/orders/:id/create-draft-invoice first.");
        process.exitCode = 1;
        return;
    }
    console.log("Using order:", order.id, "squareInvoiceId:", order.squareInvoiceId);
    const result = await (0, squareInvoicePublishService_1.publishAndSendSquareInvoiceForOrder)(order.id);
    console.log(JSON.stringify(result, null, 2));
}
main()
    .catch((err) => {
    console.error(err);
    process.exitCode = 1;
})
    .finally(() => {
    void client_1.db.$disconnect();
});
