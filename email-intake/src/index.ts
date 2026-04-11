import type { Express } from "express";
import jarvisRoutes from "./routes/jarvisRoutes";

/**
 * Registers Jarvis operator API under /api/jarvis.
 * Auth: mount after global requireApiKey in voice.run.ts (no per-route key here).
 */
export function registerJarvisApi(app: Express): void {
  app.use("/api/jarvis", jarvisRoutes);
}
