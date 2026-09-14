#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  assertCanaryProfileIsolation,
  assertExpectedCanaryAccounts,
  assertCanaryAccountIdentities,
} from './codex-account-canary-preflight.mjs'

// Opt-in authenticated canary. Uses only two explicitly supplied test homes;
// it never logs in, copies credentials, or touches an ambient Codex server.
assert(
  process.argv.includes('--run'),
  'Pass --run only after arranging two authenticated test profiles',
)
const profiles = process.env.CVG_CANARY_PROFILES
const binary = process.env.CVG_CODEX_BINARY
const expectedAccounts = [
  process.env.CVG_CANARY_ACCOUNT_A,
  process.env.CVG_CANARY_ACCOUNT_B,
]
assertExpectedCanaryAccounts(expectedAccounts)
assert(
  profiles && binary,
  'CVG_CANARY_PROFILES and CVG_CODEX_BINARY are required',
)
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const homes = await assertCanaryProfileIsolation({
  profiles,
  userHome: homedir(),
  codexHome: process.env.CODEX_HOME,
})
await assertCanaryAccountIdentities(homes, expectedAccounts)
const root = await mkdtemp(join(tmpdir(), 'cvg-authenticated-canary-'))
const userHome = join(root, 'user-home')
await mkdir(userHome)
const evidence = {
  startedAt: new Date().toISOString(),
  root,
  turns: [],
  identities: [],
  observations: {},
}
const registries = []
const children = []
const exits = []
const connections = []
const active = new Set()
const hash = (value) =>
  createHash('sha256').update(value).digest('hex').slice(0, 16)
const nonceA = randomBytes(12).toString('hex')
const nonceB = randomBytes(12).toString('hex')
const nonceSibling = randomBytes(12).toString('hex')
let releaseHold

function deferred() {
  let resolvePromise
  let rejectPromise
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  void promise.catch(() => {})
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

async function identity(connection, index) {
  const storedAuth = await readFile(join(homes[index], 'auth.json'), 'utf8')
  let auth
  try {
    auth = JSON.parse(storedAuth)
  } catch {
    throw new Error('Test account credential file is not valid JSON')
  }
  assert.equal(
    typeof auth.tokens?.account_id,
    'string',
    'Expected a ChatGPT account_id in the isolated credential store',
  )
  const jwt = auth.tokens.id_token
  assert.equal(
    hash(auth.tokens.account_id),
    expectedAccounts[index],
    'Test account does not match its expected fingerprint; no turns may run',
  )
  assert.equal(typeof jwt, 'string', 'Expected an encoded ID token')
  let claims
  try {
    claims = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'),
    )
  } catch {
    throw new Error('Test account ID-token claims are not valid JSON')
  }
  const response = await connection.rpc.request('account/read', {
    refreshToken: false,
  })
  assert.equal(
    response.account?.type,
    'chatgpt',
    'Test profile is not signed into ChatGPT',
  )
  assert(
    response.account.email?.toLowerCase() === claims.email?.toLowerCase(),
    'Account API and enrolled token identities disagree',
  )
  return {
    profile: index === 0 ? 'a' : 'b',
    accountFingerprint: hash(auth.tokens.account_id),
    emailFingerprint: hash(response.account.email),
    plan: response.account.planType,
    idTokenShape: typeof jwt,
  }
}

async function connect(host) {
  const connection = await host.connect()
  connections.push(connection)
  return connection
}

async function beginTurn(
  connection,
  threadId,
  text,
  label,
  toolHandler = () => {
    throw new Error('Unexpected tool call')
  },
) {
  const completion = deferred()
  const record = { label, threadId, status: 'starting', toolCalls: [] }
  evidence.turns.push(record)
  active.add(threadId)
  const timer = setTimeout(
    () => completion.reject(new Error(`Timed out: ${label}`)),
    120_000,
  )
  connection.rpc.onNotification((method, params) => {
    if (method === 'turn/completed' && params.threadId === threadId) {
      Object.assign(record, {
        turnId: params.turn.id,
        status: params.turn.status,
        errorCode: params.turn.error?.codexErrorInfo ?? null,
      })
      active.delete(threadId)
      completion.resolve(params.turn)
    }
  })
  connection.rpc.onServerRequest(async (method, params, requestId) => {
    try {
      assert.equal(method, 'item/tool/call', 'Unexpected native server request')
      assert.equal(params.threadId, threadId)
      record.toolCalls.push(params.tool)
      const output = await toolHandler(params.tool)
      connection.rpc.respond(requestId, {
        contentItems: [{ type: 'inputText', text: output }],
        success: true,
      })
    } catch (error) {
      connection.rpc.respondError(
        requestId,
        -32601,
        'Canary refuses this tool request',
      )
      completion.reject(error)
    }
  })
  const done = (async () => {
    try {
      await connection.rpc.request('turn/start', {
        threadId,
        input: [{ type: 'text', text }],
        effort: 'low',
      })
      const turn = await completion.promise
      assert.equal(
        turn.status,
        'completed',
        `${label} did not complete; see recorded provider error code`,
      )
      const snapshot = await connection.rpc.request('thread/read', {
        threadId,
        includeTurns: true,
      })
      const current = snapshot.thread.turns.find((item) => item.id === turn.id)
      const reply = (current?.items ?? [])
        .filter((item) => item.type === 'agentMessage')
        .map((item) => item.text)
        .join('\n')
      record.reply = reply
      return reply
    } finally {
      clearTimeout(timer)
      connection.rpc.onNotification(() => {})
    }
  })()
  void done.catch(() => {})
  return { done }
}

const dynamicTools = ['canary_nonce', 'canary_hold'].map((name) => ({
  type: 'function',
  name,
  description:
    name === 'canary_nonce'
      ? 'Read a one-time synthetic nonce for the continuity test.'
      : 'Wait for the continuity test coordinator to release this test turn.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}))
const threadOptions = {
  cwd: root,
  model: 'gpt-5.5',
  approvalPolicy: 'never',
  sandbox: 'read-only',
  ephemeral: false,
  config: { 'features.multi_agent': false },
  baseInstructions:
    'You are participating in a short account-continuity canary. Use only the canary dynamic tools explicitly requested. Do not use shell, browsing, file, or agent tools. Nonces are synthetic test data. Answer concisely and follow the requested format.',
}
const start = async (connection) =>
  (
    await connection.rpc.request('thread/start', {
      ...threadOptions,
      dynamicTools,
    })
  ).thread.id
const resume = async (connection, threadId) => {
  const result = await connection.rpc.request('thread/resume', {
    threadId,
    ...threadOptions,
  })
  assert.equal(result.thread.id, threadId, 'Native thread ID changed')
}
const release = async (connection, threadId) => {
  assert(!active.has(threadId), 'Cannot release a live turn')
  await connection.rpc.request('thread/unsubscribe', { threadId })
  connection.close()
}

try {
  evidence.version = execFileSync(binary, ['--version'], {
    encoding: 'utf8',
  }).trim()
  evidence.binary = await realpath(binary)
  evidence.commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: resolve(appRoot, '../..'),
    encoding: 'utf8',
  }).trim()
  evidence.nodeVersion = process.version
  evidence.sourceHashes = Object.fromEntries(
    await Promise.all(
      [
        fileURLToPath(import.meta.url),
        join(appRoot, 'tools/codex-account-canary-preflight.mjs'),
        join(appRoot, 'electron/backend/provider/codex/codex-server-host.ts'),
        join(appRoot, 'electron/backend/provider/codex/jsonrpc.ts'),
      ].map(async (path) => [
        path,
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      ]),
    ),
  )
  const bundle = join(root, 'host.cjs')
  await build({
    entryPoints: [
      join(appRoot, 'electron/backend/provider/codex/codex-server-host.ts'),
    ],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    external: ['electron', 'better-sqlite3'],
    logLevel: 'warning',
  })
  const { CodexServerHostRegistry } = await import(pathToFileURL(bundle).href)
  const options = {
    cwd: root,
    appVersion: 'authenticated-account-canary',
    spawnProcess(command, args, opts) {
      assert(homes.includes(opts.env.CODEX_HOME), 'Unexpected credential home')
      for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL'])
        assert.equal(opts.env[key], undefined)
      const child = spawn(command, args, {
        ...opts,
        env: {
          PATH: process.env.PATH,
          HOME: userHome,
          TMPDIR: root,
          CODEX_HOME: opts.env.CODEX_HOME,
        },
      })
      children.push(child)
      exits.push(
        new Promise((resolveExit) => {
          child.once('exit', resolveExit)
          child.once('error', resolveExit)
        }),
      )
      return child
    },
  }
  const makeRegistry = () => {
    const registry = new CodexServerHostRegistry(options)
    registry.setBinary(binary, evidence.version)
    registries.push(registry)
    return registry
  }
  const registry = makeRegistry()
  const [hostA, hostB] = homes.map((configDir) =>
    registry.get({ account: { configDir } }),
  )
  const a = await connect(hostA)
  const b = await connect(hostB)
  evidence.identities = [await identity(a, 0), await identity(b, 1)]
  assert.notEqual(
    evidence.identities[0].accountFingerprint,
    evidence.identities[1].accountFingerprint,
    'The two profiles are signed into the same OpenAI account',
  )
  console.log(
    'Verified two distinct authenticated ChatGPT profiles; starting bounded canary turns.',
  )

  const sibling = await start(a)
  await (
    await beginTurn(
      a,
      sibling,
      'Call canary_nonce once, remember its value, then reply STORED.',
      'idle-sibling-initial',
      (tool) => {
        assert.equal(tool, 'canary_nonce')
        return nonceSibling
      },
    )
  ).done
  await a.rpc.request('thread/unsubscribe', { threadId: sibling })
  const threadId = await start(a)
  evidence.threadId = threadId
  await (
    await beginTurn(
      a,
      threadId,
      'Call canary_nonce once, remember its value as FIRST, then reply STORED. Do not repeat the value.',
      'account-a-initial',
      (tool) => {
        assert.equal(tool, 'canary_nonce')
        return nonceA
      },
    )
  ).done
  await release(a, threadId)
  await registry.prepareThreadHandoff({
    account: { configDir: homes[0] },
    threadId,
    accountLabel: 'Test A',
    role: 'source',
  })
  await exits[0]
  evidence.observations.sourceAReleasedWriter = true
  await registry.prepareThreadHandoff({
    account: { configDir: homes[1] },
    threadId,
    accountLabel: 'Test B',
  })
  await resume(b, threadId)
  const replyB = await (
    await beginTurn(
      b,
      threadId,
      'Recall FIRST from the prior tool result. Call canary_nonce once and remember that new value as SECOND. Reply with FIRST only.',
      'account-b-resume',
      (tool) => {
        assert.equal(tool, 'canary_nonce')
        return nonceB
      },
    )
  ).done
  assert(
    replyB.includes(nonceA),
    'Account B did not recall the tool-derived FIRST nonce',
  )
  await release(b, threadId)

  const liveB = await connect(hostB)
  const liveThread = await start(liveB)
  const holding = deferred()
  const held = deferred()
  releaseHold = () =>
    holding.resolve(
      'The coordinator has released this synthetic wait. Reply RELEASED.',
    )
  const background = await beginTurn(
    liveB,
    liveThread,
    'Call canary_hold once. Wait for its response, then reply RELEASED.',
    'concurrent-account-b',
    (tool) => {
      assert.equal(tool, 'canary_hold')
      held.resolve()
      return holding.promise
    },
  )
  await Promise.race([
    held.promise,
    background.done.then(() => {
      throw new Error('Sibling finished without holding')
    }),
  ])
  assert(active.has(liveThread), 'Unrelated B turn is not active')
  const bPid = children[1].pid
  assert(!active.has(threadId) && !active.has(sibling), 'A is not idle')
  await assert.rejects(
    registry.prepareThreadHandoff({
      account: { configDir: homes[1] },
      threadId,
      accountLabel: 'Test B',
      role: 'source',
    }),
    { stage: 'source-busy' },
  )
  evidence.observations.sourceBusyRefusedWithoutInterrupt =
    active.has(liveThread) &&
    children[1].pid === bPid &&
    children[1].exitCode === null
  assert(
    evidence.observations.sourceBusyRefusedWithoutInterrupt,
    'Source refusal interrupted unrelated B work',
  )
  releaseHold()
  await background.done
  await release(liveB, liveThread)
  await registry.prepareThreadHandoff({
    account: { configDir: homes[1] },
    threadId,
    accountLabel: 'Test B',
    role: 'source',
  })
  await registry.prepareThreadHandoff({
    account: { configDir: homes[0] },
    threadId,
    accountLabel: 'Test A',
  })
  const newA = await connect(hostA)
  const identityAfter = await identity(newA, 0)
  assert.equal(
    identityAfter.accountFingerprint,
    evidence.identities[0].accountFingerprint,
  )
  await resume(newA, threadId)
  const replyA = await (
    await beginTurn(
      newA,
      threadId,
      'Without calling any tools, reply with the FIRST and SECOND values learned from prior canary_nonce tool results, in that order.',
      'account-a-return',
    )
  ).done
  assert(
    replyA.includes(nonceA) && replyA.includes(nonceB),
    'Returning A did not recall both prior tool-derived nonces',
  )
  evidence.observations.returnedARecallsBoth = true
  await release(newA, threadId)
  const siblingA = await connect(
    registries.at(-1).get({ account: { configDir: homes[0] } }),
  )
  await resume(siblingA, sibling)
  const replySibling = await (
    await beginTurn(
      siblingA,
      sibling,
      'Without calling tools, reply with the nonce you learned earlier from canary_nonce.',
      'idle-sibling-resumed',
    )
  ).done
  assert(
    replySibling.includes(nonceSibling),
    'Idle sibling lost its tool-derived nonce',
  )
  await release(siblingA, sibling)
  evidence.observations.idleSiblingRetainedContext = true
  evidence.verdict = 'authenticated-continuity-controls-passed'
} catch (error) {
  evidence.error = error.message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\beyJ[A-Za-z0-9_.-]+/g, '[token]')
  process.exitCode = 1
} finally {
  releaseHold?.()
  for (const connection of connections) connection.close()
  for (const registry of registries) registry.stopAll()
  await Promise.all(exits)
  evidence.ownedServersExited = children.every(
    (child) =>
      child.pid === undefined ||
      child.exitCode !== null ||
      child.signalCode !== null,
  )
  await writeFile(
    join(root, 'result.json'),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  )
  console.log(JSON.stringify(evidence, null, 2))
}
