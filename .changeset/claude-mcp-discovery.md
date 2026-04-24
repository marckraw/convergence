---
'convergence': patch
---

Fix MCP server discovery for Claude Code when built-in `claude.ai ...` servers
appear in `claude mcp list` but fail individual `claude mcp get` lookups.
Convergence now falls back to list-based parsing instead of dropping the whole
provider section, and the MCP dialog also shows Pi with a note explaining that
its CLI does not expose inspectable MCP server discovery yet.
