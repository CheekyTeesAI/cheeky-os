import prisma from "../lib/prisma";
import { runSeoAudit } from "./seoAuditEngine";

export type SeoActionRecord = {
  type: string;
  description: string;
  impact: string;
};

export const generateSeoActions = async (): Promise<SeoActionRecord[]> => {
  const findings = await runSeoAudit();

  const actions: SeoActionRecord[] = findings.map((f) => ({
    type: f.type,
    description: f.description,
    impact: f.impact,
  }));

  for (const action of actions) {
    await prisma.seoAction.create({
      data: {
        type: action.type,
        description: action.description,
        impact: action.impact,
      },
    });
  }

  return actions;
};
