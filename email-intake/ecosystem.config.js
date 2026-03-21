/**
 * PM2 Ecosystem Configuration for Cheeky OS.
 * Defines the process configuration for production deployment.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart cheeky-os
 *   pm2 logs cheeky-os
 *   pm2 stop all
 *
 * @see scripts/deploy-checklist.md for full deployment instructions.
 */

module.exports = {
  apps: [
    {
      // ── Main Application: Webhook Server + Email Poller ──────────────
      name: "cheeky-os",
      script: "start.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      output: "logs/pm2-out.log",
      error: "logs/pm2-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "production",
        // All values are pulled from .env at runtime via dotenv.
        // These are listed here for documentation only.
        // OPENAI_API_KEY: "",
        // DATAVERSE_URL: "",
        // DATAVERSE_TENANT_ID: "",
        // DATAVERSE_CLIENT_ID: "",
        // DATAVERSE_CLIENT_SECRET: "",
        // AZURE_TENANT_ID: "",
        // AZURE_CLIENT_ID: "",
        // AZURE_CLIENT_SECRET: "",
        // OUTLOOK_USER_EMAIL: "",
        // PORT: "3000",
        // WEBHOOK_SECRET: "",
        // SQUARE_ACCESS_TOKEN: "",
        // SQUARE_LOCATION_ID: "",
        // SQUARE_ENVIRONMENT: "production",
        // TEAMS_WEBHOOK_URL: "",
      },
    },
    {
      // ── Health Monitor: Pings /health every 5 minutes ────────────────
      name: "cheeky-health",
      script: "scripts/health-monitor.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "100M",
      output: "logs/health-monitor.log",
      error: "logs/health-monitor-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
