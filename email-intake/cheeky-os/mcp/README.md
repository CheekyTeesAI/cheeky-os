# Cheeky OS MCP (manifest location)

Tool definitions and the MCP registry live in **`../src/mcp/`**:

- Registry: `../src/mcp/index.js`
- Standalone SSE server: `../src/mcp/server.js`
- HTTP transport (mounted on Cheeky OS): `../src/mcp/httpMount.js`
- Handlers: `../src/mcp/tools/*.js`

After changing tools, restart the MCP client connection (for example reload MCP servers in Cursor or restart Claude Desktop) so the new tool list is discovered.
