import prisma from "../lib/prisma";

/**
 * Bridge SEO actions → executable tasks (SeoGeneratedTask, not Order Task).
 */
export const createTaskFromSeoAction = async (actionId: string) => {
  const action = await prisma.seoAction.findUnique({
    where: { id: actionId },
  });

  if (!action) return null;

  const task = await prisma.seoGeneratedTask.create({
    data: {
      seoActionId: action.id,
      orderRef: "SEO",
      type: action.type,
      status: "PENDING",
    },
  });

  return task;
};
