# The Door — what the three MCP clients send (measured)

**Status:** observed · The Door S0 (MAR-3173)  
**Date:** 2026-09-23 · **OS:** macOS 26.5.1 (arm64)  
**Server under test:** `@modelcontextprotocol/server` 2.0.0, one
`createMcpHandler` endpoint at `/mcp` with its defaults (`legacy: 'stateless'`,
`responseMode: 'auto'`), fronted by a bearer check and a request recorder.  
**Clients:** Claude Code `2.1.280` · Codex CLI `0.156.0` · Cursor agent
`2026.09.18-9a7762b`.  
**Tool:** `apps/convergence/tools/probe-mcp-door.mjs` (`--capture`, `--self-test`,
`--serve`; `--help` lists every flag). Runner for the two runtimes:
`apps/convergence/tools/run-mcp-door-electron.mjs`
(`npm run test:door-electron`, and `-- --node` for plain Node).  
**Fixture:** `apps/convergence/electron/backend/door/__fixtures__/client-handshakes.json`,
pinned by `client-handshakes.pure.test.ts` beside it.

This page states what was **seen on the wire**, not what the app does: no
product code serves MCP yet. S1 (MAR-3174) is written from it. When a client
changes, re-record with the commands below; the pins go red, and this page is
edited from the new fixture.

**How each client was pointed at the probe without touching a user config.**
Claude Code: a throwaway `CLAUDE_CONFIG_DIR` holding a `.claude.json` with the
server, and for the model turn `--mcp-config <json> --strict-mcp-config` with a
throwaway `CLAUDE_CONFIG_DIR`. Codex: `-c mcp_servers.<name>.url=…` and
`-c mcp_servers.<name>.bearer_token_env_var=…` overrides, with a throwaway
`CODEX_HOME` for the connect. Cursor: a throwaway project directory holding
`.cursor/mcp.json`, run with a throwaway `HOME`, because `agent mcp list-tools`
refuses an unapproved server and `agent mcp enable` writes Cursor's approval
list under `~/.cursor`. The token is generated per run, handed over only as
`CVG_DOOR_PROBE_TOKEN`, and never written anywhere. The sha256 of
`~/.claude.json`, `~/.codex/config.toml` and `~/.cursor/mcp.json` was identical
before and after the run (recorded on MAR-3173).

The commands, as the probe ran them (the port is the ephemeral one of that run):

| Client      | Connect (no model turn)                                                                                                                                                                                    | Model turn                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `CLAUDE_CONFIG_DIR=<tmp> claude mcp get convergence-door-probe`                                                                                                                                            | `CLAUDE_CONFIG_DIR=<tmp> claude -p '…' --mcp-config '{…}' --strict-mcp-config --allowedTools mcp__convergence-door-probe__hello --model haiku` |
| Codex       | `CODEX_HOME=<tmp> codex app-server -c mcp_servers.convergence-door-probe.url=… -c mcp_servers.convergence-door-probe.bearer_token_env_var=CVG_DOOR_PROBE_TOKEN`, fed `initialize` + `mcpServerStatus/list` | `codex exec -c … -c … --skip-git-repo-check --sandbox read-only '…'`                                                                           |
| Cursor      | `HOME=<tmp> sh -c 'agent mcp enable convergence-door-probe && agent mcp list-tools convergence-door-probe'`                                                                                                | not run: no Cursor model turn without Marcin's word                                                                                            |

Each one is `node tools/probe-mcp-door.mjs --capture <client> --port 0 --timeout-ms <n> --fixture <file>`
plus `--wrong-token` (Q3) or `--model-turn`.

## Q1 — what each client speaks

|                     | Protocol version asked for                                      | Sends `initialize`                                                                                    | Sends `Mcp-Method` / `Mcp-Name`                                        | Sends `Mcp-Session-Id` | Gets one back |
| ------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------- | ------------- |
| Claude Code 2.1.280 | `2026-07-28` (in `_meta` and the `Mcp-Protocol-Version` header) | **no**: first call is `server/discover`, then `subscriptions/listen`, `tools/list`                    | **yes**: `Mcp-Method` on every call; `Mcp-Name: hello` on `tools/call` | no                     | no            |
| Codex 0.156.0       | `2025-06-18`                                                    | **yes**, then `notifications/initialized`, `tools/list`, `resources/list`, `resources/templates/list` | no                                                                     | no                     | no            |
| Cursor 2026.09.18   | `2025-11-25`                                                    | **yes**, then `notifications/initialized`, a `GET /mcp` stream attempt, `tools/list`                  | no                                                                     | no                     | no            |

Claude Code is on the stateless 2026 protocol; Codex and Cursor still speak
2025 handshakes. No client sent or expected a session id. Codex 0.142.0 (the
build on this Mac's Node 24.15.0 path) asked for `2025-06-18` too.

Measured by: the connect command of each client above, 2026-09-23.

## Q2 — one endpoint for all three

**Yes, with the default settings.** One `createMcpHandler(factory)` endpoint
answered `tools/list` with **200** for all three clients: Claude's
2026-era calls on the modern path, and the Codex and Cursor `initialize`
handshakes through the handler's default `legacy: 'stateless'` path (a fresh
server per legacy request). No setting had to change. Two consequences for S1:

- `legacy: 'reject'` would lock Codex and Cursor out. The default must stay.
- In stateless legacy mode the handler answers `GET` with **405**. Cursor tries
  that `GET` after `initialize`, gets 405, and carries on to `tools/list`. It
  tolerates the 405.

`tools/call` at the wire: **Claude Code 200** (`hello` returned the fixed
string, the model replied with it). **Codex: tools/call not measured.** Its one
budgeted turn called the tool, and the client refused it before sending
anything ("MCP tool call requires approval, but approval policy is never"), so
the wire shows `initialize` and `tools/list` only. A re-run needs Codex's
per-server approval key; the 0.156.0 binary contains `default_tools_approval_mode`
and `approval_mode` under `mcp_servers`, but their accepted values were not
tested. **Cursor: tools/call not measured: no budget** (no Cursor model turn
without Marcin's word on MAR-3173).

Measured by: the connect commands (`tools/list`) and the model-turn commands
(`tools/call`), 2026-09-23. Statuses are the recorder's own responses, stored
in the fixture.

## Q3 — the bearer header

`Authorization: Bearer <token>` arrived on **every** request from all three,
configured the way the constitution's law 6 says: Claude Code through
`headers.Authorization` (`--header` on `claude mcp add`), Codex through
`bearer_token_env_var`, and Cursor through `headers` in `mcp.json` with
`${env:CVG_DOOR_PROBE_TOKEN}`.

What each client shows its user when the token is wrong (`--wrong-token`,
server answers 401 with `WWW-Authenticate: Bearer realm="…"`):

- **Claude Code:** `✘ Failed to connect` / `Server rejected the configured
Authorization header (HTTP 401). Check that the token is valid for this MCP
endpoint — OAuth fallback is disabled when headers.Authorization is set.`
  followed by the response body. On the wire it tried `server/discover`, then
  fell back to a legacy `initialize`. Both got 401. No OAuth discovery.
- **Codex:** the server's status carries `toolsError: "MCP startup failed:
handshaking with MCP server failed: … Auth required, when send initialize
request"`. One `initialize`, 401, no retry, no OAuth discovery.
- **Cursor:** `MCP 'convergence-door-probe' requires authentication. Please
run: agent mcp login convergence-door-probe`, exit 1. On the wire it **tried
  OAuth**: `GET /.well-known/oauth-protected-resource/mcp`,
  `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`,
  `/.well-known/openid-configuration`, then `POST /register` (dynamic client
  registration), twice. Design input for S1: answer those paths deliberately (a 404
  without OAuth metadata) so Cursor's message is the only thing a wrong token
  produces.

Measured by: each connect command with `--wrong-token`, 2026-09-23.

## Q4 — inside Electron

**Yes.** The hello server, bundled with esbuild into one CommonJS file
(`@modelcontextprotocol/server` and `/client` 2.0.0 included), started on an
ephemeral loopback port, served a v2 client's `server/discover` and
`tools/call` (200, 200), returned the fixed string, closed, and the process
exited 0:

- under the **Electron 41.2.0** binary (its Node is 24.14.0), `--no-sandbox`, no window;
- under **plain Node 24.15.0** (`.nvmrc`).

Making the server skip `listen` turns both runs red.

The probe bridges `node:http` to `handler.fetch` by hand (a `Request` in, the
`Response` streamed out). The package's own docs point `node:http` servers at
`toNodeHandler(handler)` from `@modelcontextprotocol/node`, which the probe did
not need and did not install.

Measured by: `npm run test:door-electron` and `npm run test:door-electron -- --node`
(`node tools/run-mcp-door-electron.mjs [--node]`), 2026-09-23.

## Q5 — Host and Origin

|             | `Host`             | `Origin` | `User-Agent`                    |
| ----------- | ------------------ | -------- | ------------------------------- |
| Claude Code | `127.0.0.1:<port>` | none     | `claude-code/2.1.280 (sdk-cli)` |
| Codex       | `127.0.0.1:<port>` | none     | `codex-mcp-client/0.156.0`      |
| Cursor      | `127.0.0.1:<port>` | none     | `Cursor/1.0.0`                  |

Every client sends `Host` as the URL it was given (here `127.0.0.1` plus the
port) and **no `Origin`**. Claude Code's user agent follows its environment:
run from inside an Agent SDK host it read `claude-code/2.1.280 (sdk-ts,
agent-sdk/0.3.263)`, so S1 must not key anything on it.

The v2 package's DNS-rebinding tools (names read from
`@modelcontextprotocol/server` 2.0.0's `dist/index.d.mts`):

- `hostHeaderValidationResponse(request, allowedHostnames)`, returning a 403
  `Response` or `undefined`, plus `validateHostHeader(host, allowedHostnames)`.
  Hostnames only, no ports; the header may carry a port.
- `originValidationResponse(request, allowedOriginHostnames)` and
  `validateOriginHeader(origin, allowedOriginHostnames)`. A **missing or empty
  `Origin` passes**, which all three clients need.
- `localhostAllowedHostnames()` / `localhostAllowedOrigins()` return
  `["localhost", "127.0.0.1", "[::1]"]`.
- On the lower-level `WebStandardStreamableHTTPServerTransport`:
  `allowedHosts`, `allowedOrigins`, `enableDnsRebindingProtection`.
  `createMcpHandler` itself has no host option; the check is composed in
  front of `handler.fetch` (the package's own example does exactly that).
- For S1's token: the package also exports `requireBearerAuth`,
  `verifyBearerToken` and `bearerAuthChallengeResponse`.

An allowlist of `localhostAllowedHostnames()` admits all three clients as
configured here. A client configured with `localhost` would send
`Host: localhost:<port>`, which is on the same list.

Measured by: the connect commands (headers recorded per request), 2026-09-23;
option names read from the installed package the same day.

## Q6 — who is calling

|             | Where                                                              | Value                                                                                           |
| ----------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Claude Code | `_meta["io.modelcontextprotocol/clientInfo"]` on **every** request | `{ name: "claude-code", title: "Claude Code", version: "2.1.280", description, websiteUrl }`    |
| Codex       | `initialize` → `params.clientInfo` (once per connection)           | `{ name: "codex-mcp-client", title: "Codex", version: "0.156.0" }`                              |
| Cursor      | `initialize` → `params.clientInfo` (once per connection)           | `{ name: "Cursor", version: "1.0.0" }`, a **fixed** version, not the CLI's `2026.09.18-9a7762b` |

For S1's "last client": read `clientInfo` from `initialize` (2025 clients) or
from `_meta` (2026 clients). Cursor's version says nothing about the build, so
store the name and treat Cursor's version as uninformative.

Measured by: the connect commands, 2026-09-23.
