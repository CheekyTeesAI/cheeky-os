import { createLogger, format, transports } from "winston";

export const logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message }) => `${level}: ${message}`)
      )
    })
  ]
});

/** Plain console traces for major pipeline stages (visibility / debugging). */
export const stepLog = {
  brain: (detail: string) => console.log("[brain]", detail),
  gatekeeper: (detail: string) => console.log("[gatekeeper]", detail),
  router: (detail: string) => console.log("[router]", detail),
  engine: (detail: string) => console.log("[engine]", detail)
};
