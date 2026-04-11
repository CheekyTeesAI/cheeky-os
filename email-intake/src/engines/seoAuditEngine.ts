import prisma from "../lib/prisma";
import { getSeoContext } from "../services/seo/seoService";

export type SeoFinding = {
  type: string;
  description: string;
  impact: string;
};

export const runSeoAudit = async (): Promise<SeoFinding[]> => {
  const context = getSeoContext();

  const competitors = await prisma.seoCompetitor.findMany();

  const findings: SeoFinding[] = [];

  if (competitors.length < 3) {
    findings.push({
      type: "COMPETITOR_GAP",
      description: "Not enough competitors tracked",
      impact: "HIGH",
    });
  }

  if (context.seoGoals.targetKeywords.length < 5) {
    findings.push({
      type: "KEYWORD_GAP",
      description: "Not enough target keywords defined",
      impact: "MEDIUM",
    });
  }

  return findings;
};
