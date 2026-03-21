# AI System Prompt — Cheeky Tees

## What This Is

`cheeky-system-prompt.md` is the **single source of truth** for how Cheeky AI behaves. Every AI interface (M365 Copilot, ChatGPT, future APIs) loads this prompt to understand who it is, what it can do, and how to respond.

## Files

| File | Purpose |
|------|---------|
| `cheeky-system-prompt.md` | The versioned system prompt — identity, rules, context |
| `prompt-loader.js` | Node.js utility to read and parse the prompt |
| `README.md` | This file |

## How to Update the Prompt

1. Edit `cheeky-system-prompt.md` directly
2. Update the **Version** header at the top (e.g. `v1.1 — 3/21/2026`)
3. Add a row to the **Version Changelog** table at the bottom
4. Save the file — `prompt-loader.js` will pick up changes on next load

**Important:** Do not change the Markdown heading structure unless you also update the parsers in `prompt-loader.js`. The `getCommandCategories()` function depends on the `## Command Categories` heading.

## How prompt-loader.js Works

```javascript
const { getSystemPrompt, getPromptVersion, getCommandCategories } = require("./ai/prompt-loader");

// Get the full prompt text (for sending to an AI API)
const prompt = getSystemPrompt();

// Get the version string
const version = getPromptVersion(); // "v1.0 — 3/20/2026"

// Get all command category names
const categories = getCommandCategories();
// ["BUILD_FEATURE", "MODIFY_FEATURE", "CREATE_TABLE", ...]
```

The prompt is cached on first read. Call `clearCache()` to force a re-read.

## How to Paste into M365 Copilot or ChatGPT

1. Open `cheeky-system-prompt.md`
2. Copy the **entire file contents** (Ctrl+A, Ctrl+C)
3. Paste into the system prompt or custom instructions field:
   - **M365 Copilot:** Settings → Copilot → Custom instructions → paste
   - **ChatGPT:** Settings → Custom instructions → "How would you like ChatGPT to respond?" → paste
   - **ChatGPT API:** Set as the `system` message in your messages array

## Version Control

- Always increment the version when making changes
- Use semantic versioning: v{major}.{minor}
  - **Major:** New command types, behavior rule changes, structural changes
  - **Minor:** Context updates (new tables, endpoints, integrations), wording fixes
- The changelog at the bottom of the prompt tracks all changes
- `prompt-loader.js` exposes `getPromptVersion()` to verify which version is loaded
