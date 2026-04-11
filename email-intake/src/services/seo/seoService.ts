/**
 * SEO context for audit engines (expand: env, DB, or CMS later).
 */
export type SeoContext = {
  seoGoals: {
    targetKeywords: string[];
  };
};

export function getSeoContext(): SeoContext {
  const raw = process.env.SEO_TARGET_KEYWORDS || "";
  const targetKeywords = raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    seoGoals: {
      targetKeywords,
    },
  };
}
