# MCP Integrations for Coding Agents

This note records the current setup options for giving Codex and Claude Code
access to Linear, Jira, and Confluence through Model Context Protocol (MCP)
servers.

## Services

- Linear MCP: `https://mcp.linear.app/mcp`
- Atlassian Rovo MCP for Jira and Confluence:
  `https://mcp.atlassian.com/v1/mcp/authv2`

Use the Atlassian `authv2` endpoint. The older `/v1/sse` endpoint should not be
used for new setups.

## Codex

Codex MCP configuration lives in `~/.codex/config.toml`. The CLI and IDE
extension share this file.

Add the remote servers:

```bash
codex mcp add linear --url https://mcp.linear.app/mcp
codex mcp add atlassian --url https://mcp.atlassian.com/v1/mcp/authv2
```

Interactive OAuth login:

```bash
codex mcp login linear
codex mcp login atlassian
```

On a headless VPS, OAuth callback URLs can require extra handling because a
`localhost` callback opened on a laptop points to the laptop, not the VPS.
The simplest browser-based option is an SSH tunnel with a fixed callback port:

```bash
ssh -L 5555:localhost:5555 user@vps
```

```toml
mcp_oauth_callback_port = 5555
```

For VPS automation, prefer token-based configuration when the provider and
workspace policy allow it.

Linear with a bearer token:

```toml
[mcp_servers.linear]
url = "https://mcp.linear.app/mcp"
bearer_token_env_var = "LINEAR_API_KEY"
```

Atlassian with a bearer token:

```toml
[mcp_servers.atlassian]
url = "https://mcp.atlassian.com/v1/mcp/authv2"
bearer_token_env_var = "ATLASSIAN_API_KEY"
```

Atlassian with a Basic auth header derived from `email:api_token`:

```toml
[mcp_servers.atlassian]
url = "https://mcp.atlassian.com/v1/mcp/authv2"
env_http_headers = { "Authorization" = "ATLASSIAN_AUTH_HEADER" }
```

`ATLASSIAN_AUTH_HEADER` should contain:

```text
Basic <base64(email:api_token)>
```

Atlassian API token authentication may require an organization admin to enable
the relevant MCP/API-token policy.

## Claude Code

Add the remote servers:

```bash
claude mcp add --transport http linear https://mcp.linear.app/mcp
claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp/authv2
```

For OAuth on SSH or a headless VPS, Claude Code supports a no-browser flow:

```bash
claude mcp login linear --no-browser
claude mcp login atlassian --no-browser
```

In that flow, Claude prints an authorization URL. Open it in a local browser,
approve access, then paste the final redirect URL back into the VPS terminal.
This avoids the SSH tunnel needed by callback-based localhost flows.

Token-based configuration is also possible through MCP headers, for example:

```json
{
  "mcpServers": {
    "linear": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp",
      "headers": {
        "Authorization": "Bearer ${LINEAR_API_KEY}"
      }
    }
  }
}
```

## Recommended VPS Setup

For unattended coding-agent sessions on a VPS, prefer provider tokens stored in
environment variables and referenced from MCP config. Use browser OAuth only
when token auth is unavailable or blocked by workspace policy.

## References

- Codex MCP configuration:
  `https://developers.openai.com/codex/mcp`
- Linear MCP server:
  `https://linear.app/docs/mcp`
- Atlassian Rovo MCP getting started:
  `https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/`
- Atlassian Rovo MCP API token authentication:
  `https://support.atlassian.com/atlassian-rovo-mcp-server/docs/configuring-authentication-via-api-token/`
- Claude Code MCP:
  `https://code.claude.com/docs/en/mcp`
