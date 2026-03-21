CheekyTeesAutomation deployment

Scripts:
- cheeky.ps1 - command runner (cheeky deploy|redeploy|repair|logs|export|import)
- deploy-cheeky-solution.ps1 - main deployment with self-healing features
- copilot-agent.ps1 - copilot helper to analyze logs and auto-repair

Usage:
1. Ensure pac CLI is installed and on PATH.
2. Configure deployment-config.json with correct SolutionZip, SolutionName, Environment.
3. Optionally set service principal env vars: CLIENT_ID, CLIENT_SECRET, TENANT_ID, ENV_URL
4. Run: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\cheeky.ps1 deploy

Logs are written to logs/ with timestamped filenames.
