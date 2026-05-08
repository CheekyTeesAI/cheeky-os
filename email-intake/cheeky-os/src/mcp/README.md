# Cheeky OS MCP Server

This module exposes Cheeky OS operations to MCP-compatible clients (for example, Claude Desktop) using stdio transport.

## Location

- Server entry: `email-intake/cheeky-os/src/mcp/server.js`
- Tool registry: `email-intake/cheeky-os/src/mcp/index.js`
- Tool handlers:
  - `tools/orders.js`
  - `tools/tasks.js`
  - `tools/system.js`
  - `tools/memory.js`
  - `tools/voice.js`

## Tools

1. `get_orders`
   - Input: `status?`, `limit?`
   - Action: queries Prisma `Order` model for recent orders

2. `get_tasks`
   - Input: `status?`, `orderId?`, `limit?`
   - Action: queries Prisma `Task` model for recent tasks

3. `update_task_status`
   - Input: `taskId` (required), `status` (required)
   - Action: updates a task status via Prisma `Task.update`

4. `get_system_status`
   - Input: none
   - Action: returns uptime, current time, DB connectivity check (`SELECT 1`), open order count, pending task count

5. `create_memo`
   - Input: `topic` (required), `content` (required), `source?`
   - Action: attempts Prisma upsert on `CheekyMemory` model
   - Note: if `CheekyMemory` is not in the active Prisma schema, this tool returns an error response instead of crashing

6. `run_voice_command`
   - Input: `command` (required)
   - Action: POSTs to local voice endpoint (`/voice/run`, fallback `/cheeky/voice/run`)

## Setup

From `email-intake`:

```bash
npm install @modelcontextprotocol/sdk
```

## Run

From `email-intake`:

```bash
node cheeky-os/src/mcp/server.js
```

or from `email-intake/cheeky-os`:

```bash
node src/mcp/server.js
```

## Claude Desktop config

Use the absolute path printed to stderr when the MCP server starts. Example:

```json
{
  "mcpServers": {
    "cheeky-os": {
      "command": "node",
      "args": ["C:/Users/PatCo/source/repos/CheekyAPI/email-intake/cheeky-os/src/mcp/server.js"]
    }
  }
}
```
