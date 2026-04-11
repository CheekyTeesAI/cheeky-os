import prisma from "./prisma";

export async function testCreateOrder() {
  const order = await prisma.order.create({
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
