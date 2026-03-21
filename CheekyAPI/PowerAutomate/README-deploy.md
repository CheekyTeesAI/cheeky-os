CheekyTeesAutomation deployment notes

Files:
- deploy-cheeky-solution.ps1 - Main PowerShell deployment script
- deploy-cheeky-solution.cmd - Windows launcher that runs the script with ExecutionPolicy Bypass
- deployment-config.example.json - Example config; copy to deployment-config.json and edit
- CheekyAPI/PowerAutomate/*.flow.json - Solution-aware child flows to include in the solution

Quick start:
1. Copy deployment-config.example.json -> deployment-config.json and set SolutionZip, Environment, TeamsWebhookUrl as needed.
2. Ensure pac CLI is installed and available on PATH.
3. (Optional) Set service principal env vars: CLIENT_ID, CLIENT_SECRET, TENANT_ID, ENV_URL and run script with -UseServicePrincipal.
4. Run: deploy-cheeky-solution.cmd

Notes:
- The script injects flows from CheekyAPI/PowerAutomate into the unpacked solution before packing.
- Validate flow connection references and logical names in Power Automate after import.
- The script writes logs to logs/ and deployment-audit.log.
