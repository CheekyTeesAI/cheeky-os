'use strict';

const SYSTEM_CONTEXT = `
CHEEKY OS SYSTEM:
- Node/Express CommonJS (NO ESM)
- Prisma ORM
- Square / Resend / OpenAI
- Render deployment
- Port 3000
- PROTECTED: /voice/run, /webhooks/square, Prisma schema
`;

function generateCursorPrompt(userCommand, context = {}) {
  if (!userCommand || typeof userCommand !== 'string') {
    throw new Error('Invalid command');
  }

  const cmd = userCommand.trim().replace(/`/g, '\\`');

  return `# CHEEKY OS — CURSOR TASK
## MODE: SAFE EXECUTION

SYSTEM:
${SYSTEM_CONTEXT}

COMMAND:
"${cmd}"

RULES:
- CommonJS ONLY
- NO refactor
- NO breaking routes
- MINIMAL CHANGE ONLY
- PROTECT existing logic

OUTPUT:

FILES:
- paths

CHANGES:
- bullets

CODE:
\`\`\`javascript
changed sections only
\`\`\`

STATUS:
SUCCESS | BLOCKED

EXECUTE.
`;
}

module.exports = { generateCursorPrompt };
