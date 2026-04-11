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
      name: "cheeky-os",
      script: "dist/api/voice.run.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      }
    }
  ]
};
