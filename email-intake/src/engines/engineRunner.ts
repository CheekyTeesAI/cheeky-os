import { generateSeoActions } from "./seoActionEngine";

export const runAllEngines = async () => {
  console.log("Running SEO Engine...");

  const actions = await generateSeoActions();

  console.log("SEO Actions Generated:", actions.length);

  return {
    actionsGenerated: actions.length,
  };
};
