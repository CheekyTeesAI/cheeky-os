# CheekyTees AI Ops - Deployment Command System

## Overview

Self-healing AI deployment orchestrator for the CheekyTeesAutomation Power Platform solution. All commands run through the `cheeky` CLI launcher.

## Commands

| Command | Description |
|---------|-------------|
| `cheeky deploy` | Run full deployment pipeline. On failure, auto-classifies error, runs fix, retries once. |
| `cheeky doctor` | Health check: PAC CLI, auth, ENV_URL, config, solution zip, Dataverse access. |
| `cheeky fix` | Auto-detect and repair: execution policy, PAC CLI, ENV_URL, auth, config, missing zip. |
| `cheeky rebuild` | Delete solution zip + unpack folder, re-export from Dataverse, redeploy. |
| `cheeky logs` | Open the logs folder in Explorer. |
| `cheeky classify-error` | Analyze the latest log file against known error patterns in error-map.json. |
| `cheeky autopilot` | Full auto: doctor -> fix -> deploy -> classify -> retry. One command, zero manual steps. |

## Files

| File | Purpose |
|------|---------|
| `cheeky.cmd` | Windows launcher (sets ExecutionPolicy Bypass automatically) |
| `cheeky-orchestrator.ps1` | Master orchestrator with all commands |
| `cheeky-agent.ps1` | Legacy simple agent (still functional) |
| `deploy-cheeky-solution.ps1` | Core PAC CLI deployment script |
| `deployment-config.json` | Environment and solution configuration |
| `error-map.json` | Known error pattern -> fix mapping for classify-error |
| `logs/` | Timestamped deployment logs + latest.log |

## Quick Start

```
cheeky autopilot
```

## Requirements

- PowerShell 5.1+
- Power Platform CLI (pac) on PATH
- ENV_URL environment variable set to your Dataverse org URL
- Authenticated pac session (interactive or service principal)

## Error Categories

The classify-error command maps log content to these categories:

- execution-policy
- pac-auth
- missing-zip
- connection-reference-permission
- invalid-pac-command
- import-failure
- missing-pac
- env-url-missing
- log-file-locked
- publish-failure
- unknown

Each category has a known fix defined in error-map.json.
