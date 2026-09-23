#!/usr/bin/env node
/**
 * The Door probe (MAR-3173, The Door S0). A hello MCP server — one tool,
 * `hello`, answering a fixed string — built on `@modelcontextprotocol/server`
 * 2.x, fronted by a request recorder, so what Claude Code, Codex and Cursor
 * actually send to an MCP door is measured instead of guessed.
 *
 * Importing this module has no side effects: `main()` runs only when the file
 * is executed directly. `electron/backend/door/client-handshakes.pure.test.ts`
 * imports `recordRequest` to prove the recorder keeps no secret, and
 * `run-mcp-door-electron.mjs` bundles `runSelfTest` to run the same server
 * under the Electron binary and under Node.
 *
 * The bearer token is generated per run with `randomBytes`, handed to each
 * client through the `CVG_DOOR_PROBE_TOKEN` environment variable, and never
 * written to disk: every client config this probe writes names the variable,
 * not the value, and the recorder keeps only the header's presence and scheme.
 *
 * No user configuration is ever written: each client is pointed at the probe
 * through per-invocation flags or a throwaway directory under the OS temp dir
 * (see CLIENTS below), and every throwaway directory is removed on exit.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  CLIENT_INFO_META_KEY,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  createMcpHandler,
} from '@modelcontextprotocol/server'

export const HELLO_TEXT = 'hello from the convergence door probe'
export const TOKEN_ENV_VAR = 'CVG_DOOR_PROBE_TOKEN'
export const SERVER_NAME = 'convergence-door-probe'
export const MCP_PATH = '/mcp'

export const HELP = `Usage:
  node tools/probe-mcp-door.mjs --serve --port <n> [options]
  node tools/probe-mcp-door.mjs --capture <claude|codex|cursor> --port <n> --fixture <file> [options]

Modes (exactly one):
  --serve                   Start the hello server and print every recorded request as one JSON
                            line until Ctrl-C. The token is printed ONCE to stderr for manual use.
  --capture <client>        Start the hello server, run the client's connect command against it
                            (see "Clients" below), and merge the client's entry into --fixture.
  --self-test               Start the hello server, call \`hello\` with the v2 client over HTTP,
                            assert the fixed string, close, exit 0. This is what
                            tools/run-mcp-door-electron.mjs runs under Electron and Node.

Options:
  --port <n>                Port to listen on. 0 asks the OS for a free port. Required.
  --host <address>          Interface to bind. Required with --serve; --capture and
                            --self-test bind 127.0.0.1.
  --fixture <file>          The fixture file --capture merges into (one entry per client).
  --wrong-token             Configure the client with a token the server refuses, and record
                            what the client prints on the 401 (stored as unauthorizedOutput).
  --model-turn              ALSO run the client's one model turn that calls \`hello\`, to see a
                            real tools/call. Spends the client's plan. Refused for cursor unless
                            --cursor-model-turn-approved is also given (Marcin's word on MAR-3173).
  --cursor-model-turn-approved
  --timeout-ms <n>          Kill the client command after this long. Required with --capture.
  --help                    Show this help.

Clients (every command runs with ${TOKEN_ENV_VAR} in its environment):
  claude   CLAUDE_CONFIG_DIR=<tmp> claude mcp get ${SERVER_NAME}, the server defined in
           <tmp>/.claude.json with header Authorization: Bearer \${${TOKEN_ENV_VAR}}.
           Model turn: CLAUDE_CONFIG_DIR=<tmp> claude -p --mcp-config <json> --strict-mcp-config
           (your own login, found through CLAUDE_SECURESTORAGE_CONFIG_DIR).
  codex    CODEX_HOME=<tmp> codex mcp-server-status via the app-server, with
           -c mcp_servers.${SERVER_NAME}.url=<url> -c ...bearer_token_env_var=${TOKEN_ENV_VAR}.
           Model turn: codex exec with the same -c overrides (your own login in ~/.codex; an
           inherited CODEX_HOME is dropped, see clientEnvironment).
  cursor   HOME=<tmp> agent mcp enable ${SERVER_NAME} && agent mcp list-tools ${SERVER_NAME}, from
           a throwaway project directory holding .cursor/mcp.json with
           headers.Authorization = "Bearer \${env:${TOKEN_ENV_VAR}}". The throwaway HOME keeps
           Cursor's approved-servers list out of the real ~/.cursor.

Never written: ~/.claude.json, ~/.codex/config.toml, ~/.cursor/mcp.json, ~/.convergence/**.
`

/**
 * The recorder. Turns one HTTP exchange into a record that is safe to commit:
 * header NAMES only, and for Authorization only `{ present, scheme }`. The few
 * header values kept are the ones the six questions are about and that carry
 * no credential (Host, Origin, User-Agent, the MCP headers).
 *
 * @param {{ method: string, path: string, headers: Record<string, string | string[] | undefined>, body: string, response: { status: number, headers: Record<string, string> } }} exchange
 */
export function recordRequest(exchange) {
  const headers = lowerCaseHeaders(exchange.headers)
  const authorization = headers.authorization
  const rpc = parseRpc(exchange.body)
  return {
    httpMethod: exchange.method,
    path: exchange.path,
    headerNames: Object.keys(headers).sort(),
    authorization:
      authorization === undefined
        ? { present: false }
        : { present: true, scheme: authorization.split(' ')[0] ?? '' },
    host: headers.host ?? null,
    origin: headers.origin ?? null,
    userAgent: headers['user-agent'] ?? null,
    mcpMethodHeader: headers['mcp-method'] ?? null,
    mcpNameHeader: headers['mcp-name'] ?? null,
    mcpProtocolVersionHeader: headers['mcp-protocol-version'] ?? null,
    mcpSessionIdSent: headers['mcp-session-id'] !== undefined,
    rpc,
    response: {
      status: exchange.response.status,
      contentType: exchange.response.headers['content-type'] ?? null,
      mcpSessionIdReturned:
        exchange.response.headers['mcp-session-id'] !== undefined,
    },
  }
}

/** @param {Record<string, string | string[] | undefined>} raw */
function lowerCaseHeaders(raw) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value
  }
  return out
}

/**
 * The JSON-RPC facts a record keeps: the method, whether it is a request or a
 * notification, the protocol version it asks for, and who is calling. Params
 * beyond those are not kept — `tools/call` arguments are the model's text.
 *
 * @param {string} body
 */
function parseRpc(body) {
  if (!body) return null
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return { unparsable: true }
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed]
  return messages.map((message) => {
    const params = message?.params ?? {}
    const meta = params?._meta ?? {}
    return {
      method: message?.method ?? null,
      kind:
        message?.method === undefined
          ? 'response'
          : message?.id === undefined
            ? 'notification'
            : 'request',
      protocolVersion:
        params.protocolVersion ?? meta[PROTOCOL_VERSION_META_KEY] ?? null,
      clientInfo: params.clientInfo ?? meta[CLIENT_INFO_META_KEY] ?? null,
      metaKeys: Object.keys(meta).sort(),
      toolName: message?.method === 'tools/call' ? (params.name ?? null) : null,
    }
  })
}

/** The hello server's factory: one tool, one fixed answer. */
function createHelloServer() {
  const server = new McpServer({ name: SERVER_NAME, version: '0.0.0' })
  server.registerTool(
    'hello',
    { description: 'Answers a fixed string. The Door probe (MAR-3173).' },
    async () => ({ content: [{ type: 'text', text: HELLO_TEXT }] }),
  )
  return server
}

/**
 * Starts the hello server on node:http. One `createMcpHandler` endpoint at
 * `MCP_PATH`, with its defaults (`legacy: 'stateless'`, `responseMode: 'auto'`)
 * — the question is whether the default endpoint serves all three clients.
 * Every exchange is recorded (see `recordRequest`) and handed to `onRecord`.
 * A request whose bearer token is not `token` gets `401` with
 * `WWW-Authenticate: Bearer` before the MCP handler sees it.
 *
 * @param {{ host: string, port: number, token: string, onRecord: (record: ReturnType<typeof recordRequest>) => void }} options
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startHelloServer({ host, port, token, onRecord }) {
  const handler = createMcpHandler(() => createHelloServer())
  const http = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString('utf8')
    const path = req.url ?? '/'
    const record = (status, headers) =>
      onRecord(
        recordRequest({
          method: req.method ?? 'GET',
          path,
          headers: req.headers,
          body,
          response: { status, headers },
        }),
      )

    if (req.headers.authorization !== `Bearer ${token}`) {
      const headers = {
        'content-type': 'application/json',
        'www-authenticate': 'Bearer realm="convergence-door-probe"',
      }
      record(401, headers)
      res.writeHead(401, headers)
      res.end(JSON.stringify({ error: 'invalid_token' }))
      return
    }
    if (!path.startsWith(MCP_PATH)) {
      record(404, {})
      res.writeHead(404)
      res.end()
      return
    }

    const request = new Request(`http://${req.headers.host ?? host}${path}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([name, value]) =>
        value === undefined
          ? []
          : [[name, Array.isArray(value) ? value.join(', ') : value]],
      ),
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    })
    const response = await handler.fetch(request)
    const responseHeaders = Object.fromEntries(response.headers.entries())
    record(response.status, responseHeaders)
    res.writeHead(response.status, responseHeaders)
    if (response.body) {
      for await (const chunk of response.body) res.write(chunk)
    }
    res.end()
  })

  await new Promise((resolveListen, rejectListen) => {
    http.once('error', rejectListen)
    http.listen(port, host, () => resolveListen(undefined))
  })
  const address = http.address()
  const boundPort = typeof address === 'object' && address ? address.port : port
  return {
    url: `http://${host}:${boundPort}${MCP_PATH}`,
    close: async () => {
      await handler.close()
      http.closeAllConnections()
      await new Promise((resolveClose) =>
        http.close(() => resolveClose(undefined)),
      )
    },
  }
}

/**
 * R4: the server serves a real v2 client over HTTP and closes. Throws on any
 * deviation; the caller turns a throw into a non-zero exit.
 */
export async function runSelfTest() {
  const { Client, StreamableHTTPClientTransport } =
    await import('@modelcontextprotocol/client')
  const token = randomBytes(24).toString('hex')
  const records = []
  const server = await startHelloServer({
    host: '127.0.0.1',
    port: 0,
    token,
    onRecord: (record) => records.push(record),
  })
  try {
    const client = new Client(
      { name: 'convergence-door-self-test', version: '0.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )
    const transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    })
    await client.connect(transport)
    const result = await client.callTool({ name: 'hello', arguments: {} })
    const text = result?.content?.[0]?.text
    if (text !== HELLO_TEXT) {
      throw new Error(
        `hello returned ${JSON.stringify(text)}, expected ${JSON.stringify(HELLO_TEXT)}`,
      )
    }
    await client.close()
    const methods = records.flatMap((record) =>
      (record.rpc ?? []).map((rpc) => rpc.method),
    )
    return {
      runtime: process.versions.electron
        ? `electron ${process.versions.electron}`
        : 'node',
      node: process.versions.node,
      text,
      methods,
      statuses: records.map((record) => record.response.status),
    }
  } finally {
    await server.close()
  }
}

// ---------------------------------------------------------------------------
// The clients. Each returns the command to run and a cleanup; the command is
// stored verbatim in the fixture (the token appears only as the env var name).
// ---------------------------------------------------------------------------

/** @param {{ url: string, workDir: string, modelTurn: boolean }} options */
function claudeCommand({ url, workDir, modelTurn }) {
  const serverConfig = {
    type: 'http',
    url,
    headers: { Authorization: `Bearer \${${TOKEN_ENV_VAR}}` },
  }
  if (modelTurn) {
    const mcpConfig = JSON.stringify({
      mcpServers: { [SERVER_NAME]: serverConfig },
    })
    return {
      command: 'claude',
      args: [
        '-p',
        `Call the ${SERVER_NAME} hello tool once and reply with exactly what it returned.`,
        '--mcp-config',
        mcpConfig,
        '--strict-mcp-config',
        '--allowedTools',
        `mcp__${SERVER_NAME}__hello`,
        '--model',
        'haiku',
      ],
      // Every file the turn writes (session log, global config) lands in the
      // throwaway dir; the login is found through the inherited
      // CLAUDE_SECURESTORAGE_CONFIG_DIR, never by reading it here.
      env: { CLAUDE_CONFIG_DIR: join(workDir, 'claude-turn') },
    }
  }
  const configDir = join(workDir, 'claude-config')
  mkdirSync(configDir, { recursive: true })
  writeFileSync(
    join(configDir, '.claude.json'),
    JSON.stringify({ mcpServers: { [SERVER_NAME]: serverConfig } }, null, 2),
  )
  return {
    command: 'claude',
    args: ['mcp', 'get', SERVER_NAME],
    env: { CLAUDE_CONFIG_DIR: configDir },
  }
}

/** @param {{ url: string, workDir: string, modelTurn: boolean }} options */
function codexCommand({ url, workDir, modelTurn }) {
  const overrides = [
    '-c',
    `mcp_servers.${SERVER_NAME}.url="${url}"`,
    '-c',
    `mcp_servers.${SERVER_NAME}.bearer_token_env_var="${TOKEN_ENV_VAR}"`,
  ]
  if (modelTurn) {
    return {
      command: 'codex',
      args: [
        'exec',
        ...overrides,
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        `Call the ${SERVER_NAME} hello tool once and reply with exactly what it returned.`,
      ],
      env: {},
      cwd: workDir,
    }
  }
  const codexHome = join(workDir, 'codex-home')
  mkdirSync(codexHome, { recursive: true })
  return {
    command: 'codex',
    args: ['app-server', ...overrides],
    env: { CODEX_HOME: codexHome },
    stdin: codexAppServerScript(),
  }
}

/**
 * The app-server conversation that makes Codex connect to its MCP servers
 * without a model turn: `initialize`, then `mcpServerStatus/list`.
 */
function codexAppServerScript() {
  return [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'convergence-door-probe', version: '0.0.0' },
      },
    },
    { jsonrpc: '2.0', method: 'initialized' },
    { jsonrpc: '2.0', id: 2, method: 'mcpServerStatus/list', params: {} },
  ]
    .map((message) => JSON.stringify(message))
    .join('\n')
    .concat('\n')
}

/** @param {{ url: string, workDir: string, modelTurn: boolean }} options */
function cursorCommand({ url, workDir, modelTurn }) {
  const projectDir = join(workDir, 'cursor-project')
  mkdirSync(join(projectDir, '.cursor'), { recursive: true })
  writeFileSync(
    join(projectDir, '.cursor', 'mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          [SERVER_NAME]: {
            url,
            headers: { Authorization: `Bearer \${env:${TOKEN_ENV_VAR}}` },
          },
        },
      },
      null,
      2,
    ),
  )
  if (modelTurn) {
    return {
      command: 'agent',
      args: [
        '-p',
        `Call the ${SERVER_NAME} hello tool once and reply with exactly what it returned.`,
        '--approve-mcps',
      ],
      env: {},
      cwd: projectDir,
    }
  }
  // `agent mcp list-tools` refuses a server that is not on Cursor's "local
  // approved list", and `agent mcp enable` WRITES that list under ~/.cursor.
  // A throwaway HOME keeps the approval, and every other file the agent
  // writes, out of Marcin's real ~/.cursor.
  const cursorHome = join(workDir, 'cursor-home')
  mkdirSync(cursorHome, { recursive: true })
  return {
    command: 'sh',
    args: [
      '-c',
      `agent mcp enable ${SERVER_NAME} && agent mcp list-tools ${SERVER_NAME}`,
    ],
    env: { HOME: cursorHome },
    cwd: projectDir,
  }
}

export const CLIENTS = {
  claude: { build: claudeCommand, versionArgs: ['claude', ['--version']] },
  codex: { build: codexCommand, versionArgs: ['codex', ['--version']] },
  cursor: { build: cursorCommand, versionArgs: ['agent', ['--version']] },
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {Record<string, unknown>} */
  const args = { help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const next = () => {
      const value = argv[index + 1]
      if (value === undefined) throw new Error(`${flag} needs a value`)
      index += 1
      return value
    }
    switch (flag) {
      case '--help':
        args.help = true
        break
      case '--serve':
        args.mode = 'serve'
        break
      case '--self-test':
        args.mode = 'self-test'
        break
      case '--capture':
        args.mode = 'capture'
        args.client = next()
        break
      case '--port':
        args.port = Number(next())
        break
      case '--host':
        args.host = next()
        break
      case '--fixture':
        args.fixture = next()
        break
      case '--timeout-ms':
        args.timeoutMs = Number(next())
        break
      case '--wrong-token':
        args.wrongToken = true
        break
      case '--model-turn':
        args.modelTurn = true
        break
      case '--cursor-model-turn-approved':
        args.cursorModelTurnApproved = true
        break
      default:
        throw new Error(`Unknown argument: ${flag}`)
    }
  }
  return args
}

/**
 * The environment a client runs with. The probe usually runs inside a
 * Convergence session, whose environment points Claude and Codex at one of
 * Marcin's provider accounts (CLAUDE_CONFIG_DIR, CODEX_HOME) and at the
 * running session (CLAUDECODE, CLAUDE_CODE_SESSION_ID, the messaging socket).
 * None of that may reach a probed client: it would write into
 * ~/.convergence/provider-accounts/ or talk to the live session. Only
 * CLAUDE_SECURESTORAGE_CONFIG_DIR is kept, so a model turn can find its login.
 */
export function clientEnvironment(inherited, overrides, token) {
  const kept = Object.fromEntries(
    Object.entries(inherited).filter(
      ([name]) =>
        name === 'CLAUDE_SECURESTORAGE_CONFIG_DIR' ||
        !(
          name === 'CLAUDECODE' ||
          name === 'CODEX_HOME' ||
          name.startsWith('CLAUDE_')
        ),
    ),
  )
  return { ...kept, ...overrides, [TOKEN_ENV_VAR]: token }
}

/** Runs one client command to completion (or the timeout) and returns its output. */
function runClient({ command, args, env, cwd, stdin }, { timeoutMs, token }) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd,
      env: clientEnvironment(process.env, env, token),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    // The app-server stays up on an open stdin; it is fed its script and then
    // given the timeout to answer, after which the probe ends it.
    if (stdin) child.stdin.write(stdin)
    else child.stdin.end()
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolveRun({ code, signal, stdout, stderr })
    })
  })
}

function runVersion([command, args]) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.on('close', () => resolveRun(out.trim()))
  })
}

/** Keeps a client's printed output reviewable and free of anything secret. */
function scrubOutput(text, { token, workDir }) {
  return text
    .split(token)
    .join('<token>')
    .split(workDir)
    .join('<tmp>')
    .split(process.env.HOME ?? '\u0000')
    .join('~')
    .trim()
    .slice(0, 4000)
}

function describeCommand(spec) {
  const envPart = Object.keys(spec.env)
    .map((name) => `${name}=<tmp>`)
    .join(' ')
  const argPart = spec.args
    .map((arg) => (/[\s"{}$]/.test(arg) ? `'${arg}'` : arg))
    .join(' ')
  return [envPart, spec.command, argPart].filter(Boolean).join(' ')
}

async function capture(args) {
  const client = CLIENTS[/** @type {keyof typeof CLIENTS} */ (args.client)]
  if (!client)
    throw new Error(
      `--capture takes claude, codex or cursor, not ${args.client}`,
    )
  if (!args.fixture) throw new Error('--capture needs --fixture')
  if (!Number.isFinite(args.timeoutMs))
    throw new Error('--capture needs --timeout-ms')
  if (!Number.isFinite(args.port)) throw new Error('--capture needs --port')
  if (
    args.modelTurn &&
    args.client === 'cursor' &&
    !args.cursorModelTurnApproved
  ) {
    throw new Error(
      'A Cursor model turn spends Marcin’s Cursor plan; it needs --cursor-model-turn-approved and his word on MAR-3173.',
    )
  }

  const token = randomBytes(24).toString('hex')
  const serverToken = args.wrongToken ? randomBytes(24).toString('hex') : token
  const records = []
  const server = await startHelloServer({
    host: '127.0.0.1',
    port: /** @type {number} */ (args.port),
    token: serverToken,
    onRecord: (record) => records.push(record),
  })
  const workDir = mkdtempSync(join(tmpdir(), 'cvg-door-probe-'))
  try {
    const spec = client.build({
      url: server.url,
      workDir,
      modelTurn: Boolean(args.modelTurn),
    })
    const run = await runClient(spec, { timeoutMs: args.timeoutMs, token })
    const version = await runVersion(client.versionArgs)
    const output = scrubOutput(`${run.stdout}\n${run.stderr}`, {
      token,
      workDir,
    })
    const variant = args.wrongToken
      ? 'unauthorized'
      : args.modelTurn
        ? 'modelTurn'
        : 'connect'

    const fixture = readFixture(args.fixture)
    const entry = fixture.clients[args.client] ?? {}
    entry.client = args.client
    entry.version = version
    entry.capturedAt = new Date().toISOString().slice(0, 10)
    entry[variant] = {
      command: describeCommand(spec),
      exit: run.signal ? `signal ${run.signal}` : run.code,
      requests: records,
      ...(variant === 'connect' ? {} : { output }),
    }
    fixture.clients[args.client] = entry
    writeFileSync(args.fixture, `${JSON.stringify(fixture, null, 2)}\n`)
    console.log(
      JSON.stringify({
        client: args.client,
        variant,
        exit: entry[variant].exit,
        requests: records.length,
      }),
    )
    console.log(output)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
    await server.close()
  }
}

function readFixture(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {
      about:
        'Recorded by apps/convergence/tools/probe-mcp-door.mjs --capture (MAR-3173). Only client, version, capturedAt and command are metadata; every request is what the client sent.',
      clients: {},
    }
  }
}

async function serve(args) {
  if (!args.host) throw new Error('--serve needs --host')
  if (!Number.isFinite(args.port)) throw new Error('--serve needs --port')
  const token = randomBytes(24).toString('hex')
  const server = await startHelloServer({
    host: /** @type {string} */ (args.host),
    port: /** @type {number} */ (args.port),
    token,
    onRecord: (record) => console.log(JSON.stringify(record)),
  })
  console.error(`serving ${server.url}\n${TOKEN_ENV_VAR}=${token}`)
  process.once('SIGINT', () => server.close().then(() => process.exit(0)))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.mode) {
    console.log(HELP)
    process.exit(args.help ? 0 : 2)
  }
  if (args.mode === 'self-test') {
    const result = await runSelfTest()
    console.log(JSON.stringify(result))
    return
  }
  if (args.mode === 'serve') return serve(args)
  return capture(args)
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
