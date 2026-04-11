function tryGetPrisma() {
  try {
    const prismaModule = require("../lib/prisma");
    return prismaModule?.prisma || prismaModule;
  } catch (_) {}
  return null;
}

async function saveOrderAndTasks({ order, tasks }) {
  const prisma = tryGetPrisma();

  if (!prisma || !prisma.order || !prisma.task) {
    console.warn("⚠️ Prisma not available — logging only");
    console.log("ORDER:", order);
    console.log("TASKS:", tasks);
    return { persisted: false, order, tasks };
  }

  const createdOrder = await prisma.order.create({
    data: {
      squarePaymentId: order.squarePaymentId,
      squareOrderId: order.squareOrderId,
      buyerEmail: order.buyerEmail,
      amountMoney: order.amountMoney,
      currency: order.currency
    }
  });

  const createdTasks = [];

  for (const task of tasks) {
    const createdTask = await prisma.task.create({
      data: {
        orderId: createdOrder.id,
        title: task.title,
        type: task.type,
        status: task.status
      }
    });
    createdTasks.push(createdTask);
  }

  return { persisted: true, order: createdOrder, tasks: createdTasks };
}

module.exports = { saveOrderAndTasks };
