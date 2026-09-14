#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { startContinuityFixture } from './codex-continuity-fixture.mjs'

/**
 * MAR-3010: observe cross-home history with both account servers resident.
 * No login, credentials, external model, or existing home is used. All methods
 * are allowlisted below. --capture-input permits turns ONLY on a loopback
 * fixture provider, recording outbound context and testing malformed SSE.
 *
 * Run with the repository's Node version:
 * node apps/convergence/tools/probe-codex-account-continuity.mjs --capture-input
 * CVG_CODEX_BINARY may select the exact CLI under investigation.
 * Temporary synthetic evidence is retained and its location is printed.
 */
const allowedMethods = new Set([
  'account/read',
  'thread/start',
  'thread/read',
  'thread/resume',
  'thread/inject_items',
  'thread/unsubscribe',
  'thread/loaded/list',
])
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = await mkdtemp(join(tmpdir(), 'cvg-account-resident-probe-'))
const connections = []
const children = []
const exits = []
const registries = []
const captureInput = process.argv.includes('--capture-input')
const evidence = {
  externalModelTurnsSent: 0,
  fixtureTurnsStarted: 0,
  startedAt: new Date().toISOString(),
  root,
  observations: {},
}
const markerA = 'SYNTHETIC_A_TOOL_NONCE_731'
const markerB = 'SYNTHETIC_B_APPENDED_448'
const markerSibling = 'SYNTHETIC_IDLE_SIBLING_927'
let registry
let fixture
const fixtureThreads = new Set()

function resolveBinary() {
  if (process.env.CVG_CODEX_BINARY) return process.env.CVG_CODEX_BINARY
  const output = execFileSync(
    process.env.SHELL || '/bin/zsh',
    ['-lc', 'command -v codex'],
    { encoding: 'utf8' },
  )
  const binary = output
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('/'))
    .pop()
  if (!binary) throw new Error('Codex is unavailable on the login-shell PATH')
  return binary
}

async function request(connection, method, params = {}) {
  if (method === 'turn/start') {
    assert(
      fixture && fixtureThreads.has(params.threadId),
      'Turns require a verified fixture-provider thread',
    )
    evidence.fixtureTurnsStarted++
  } else {
    assert(allowedMethods.has(method), `Probe method is not allowed: ${method}`)
  }
  return connection.rpc.request(method, params)
}

async function fixtureTurn(connection, id, text) {
  let finish
  let fail
  const completion = new Promise((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  void completion.catch(() => {})
  const timer = setTimeout(
    () => fail(new Error('Fixture turn did not settle within 15s')),
    15_000,
  )
  connection.rpc.onNotification((method, params) => {
    if (method === 'turn/completed' && params.threadId === id)
      finish(params.turn)
  })
  connection.rpc.onServerRequest((_method, _params, requestId) =>
    connection.rpc.respondError(
      requestId,
      -32601,
      'The fixture never executes tools',
    ),
  )
  try {
    const firstRequestIndex = fixture.requests.length
    await request(connection, 'turn/start', {
      threadId: id,
      input: [{ type: 'text', text }],
    })
    const turn = await completion
    for (const captured of fixture.requests.slice(firstRequestIndex)) {
      Object.assign(captured, {
        threadId: id,
        turnId: turn.id,
        turnInput: text,
      })
    }
    return turn
  } finally {
    clearTimeout(timer)
    connection.rpc.onNotification(() => {})
  }
}

async function append(connection, id, text) {
  if (fixture) {
    const turn = await fixtureTurn(connection, id, text)
    assert.equal(
      turn.status,
      'completed',
      `Fixture failed: ${JSON.stringify(turn.error)}`,
    )
    return turn
  }
  await inject(connection, id, text)
}

async function connect(host) {
  const connection = await host.connect()
  connections.push(connection)
  return connection
}

async function inspect(connection, id, label) {
  const response = await request(connection, 'thread/read', {
    threadId: id,
    includeTurns: true,
  })
  await writeFile(
    join(root, `${label}.json`),
    JSON.stringify(response, null, 2),
  )
  const serialized = JSON.stringify(response)
  return {
    markerA: serialized.includes(markerA),
    markerB: serialized.includes(markerB),
    turns: response.thread.turns.length,
  }
}

async function inject(connection, id, text) {
  await request(connection, 'thread/inject_items', {
    threadId: id,
    items: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    ],
  })
}

async function release(connection, id) {
  const result = await request(connection, 'thread/unsubscribe', {
    threadId: id,
  })
  connection.close()
  return result.status
}

try {
  const binary = resolveBinary()
  const version = execFileSync(binary, ['--version'], {
    encoding: 'utf8',
  }).trim()
  const repoRoot = resolve(appRoot, '../..')
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()
  const sourceHashes = {}
  for (const relative of [
    'tools/probe-codex-account-continuity.mjs',
    'tools/codex-continuity-fixture.mjs',
    'electron/backend/provider/codex/codex-server-host.ts',
  ]) {
    sourceHashes[relative] = createHash('sha256')
      .update(await readFile(join(appRoot, relative)))
      .digest('hex')
  }
  Object.assign(evidence, {
    binary,
    version,
    nodeVersion: process.version,
    commit,
    sourceHashes,
  })
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
  if (captureInput) fixture = await startContinuityFixture()
  const fixtureHome = join(root, 'user-home')
  await mkdir(fixtureHome)
  const homes = ['account-a', 'account-b'].map((name) => join(root, name))
  for (const home of homes) {
    await mkdir(home, { mode: 0o700 })
    const fixtureConfig = fixture
      ? `model_provider = "continuity_fixture"\nmodel = "cvg-continuity-fixture"\n[model_providers.continuity_fixture]\nname = "Local continuity fixture"\nbase_url = "${fixture.baseUrl(home.split('/').at(-1))}"\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\nstream_idle_timeout_ms = 2000\n`
      : ''
    await writeFile(
      join(home, 'config.toml'),
      `cli_auth_credentials_store = "file"\n${fixtureConfig}[analytics]\nenabled = false\n`,
    )
  }
  await mkdir(join(homes[0], 'sessions'))
  await symlink(join(homes[0], 'sessions'), join(homes[1], 'sessions'))
  const registryOptions = {
    cwd: root,
    appVersion: 'account-continuity-probe',
    spawnProcess: (command, args, options) => {
      assert(
        homes.includes(options.env.CODEX_HOME),
        'Refusing to use a non-fixture home',
      )
      for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL'])
        assert.equal(
          options.env[key],
          undefined,
          `Account environment leaked ${key}`,
        )
      const child = spawn(command, args, {
        ...options,
        env: {
          PATH: process.env.PATH,
          HOME: fixtureHome,
          TMPDIR: root,
          CODEX_HOME: options.env.CODEX_HOME,
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
  registry = new CodexServerHostRegistry(registryOptions)
  registries.push(registry)
  registry.setBinary(binary, version)
  const [hostA, hostB] = homes.map((configDir) =>
    registry.get({ account: { configDir } }),
  )
  const controlA = await connect(hostA)
  const controlB = await connect(hostB)
  for (const control of [controlA, controlB]) {
    const auth = await request(control, 'account/read', { refreshToken: false })
    assert.equal(auth.account, null, 'Fixture unexpectedly has an account')
  }
  evidence.emptyHomesUnauthenticated = true
  const a = await connect(hostA)
  const start = {
    model: fixture ? 'cvg-continuity-fixture' : 'gpt-5.5',
    ...(fixture ? { modelProvider: 'continuity_fixture' } : {}),
    cwd: root,
    approvalPolicy: 'never',
    sandbox: 'read-only',
    ephemeral: false,
  }
  const x = await request(a, 'thread/start', start)
  const id = x.thread.id
  if (fixture) {
    assert.equal(x.modelProvider, 'continuity_fixture')
    fixtureThreads.add(id)
  }
  evidence.threadId = id
  const sibling = await request(controlA, 'thread/start', start)
  if (fixture) {
    assert.equal(sibling.modelProvider, 'continuity_fixture')
    fixtureThreads.add(sibling.thread.id)
  }
  await append(controlA, sibling.thread.id, markerSibling)
  const replySibling = fixture?.requests.at(-1)?.reply
  await request(controlA, 'thread/unsubscribe', { threadId: sibling.thread.id })
  await append(a, id, markerA)
  evidence.observations.initialA = await inspect(a, id, 'initial-a')
  evidence.observations.unsubscribeA = await release(a, id)
  evidence.observations.loadedAAfterRelease = await request(
    controlA,
    'thread/loaded/list',
  )
  const b = await connect(hostB)
  const resumedB = await request(b, 'thread/resume', { threadId: id, ...start })
  assert.equal(resumedB.thread.id, id)
  if (fixture) assert.equal(resumedB.modelProvider, 'continuity_fixture')
  await append(b, id, markerB)
  const replyB = fixture?.requests.at(-1)?.reply
  evidence.observations.afterAppendB = await inspect(b, id, 'after-append-b')
  evidence.observations.unsubscribeB = await release(b, id)
  evidence.observations.loadedBAfterRelease = await request(
    controlB,
    'thread/loaded/list',
  )
  const back = await connect(hostA)
  const resumedA = await request(back, 'thread/resume', {
    threadId: id,
    ...start,
  })
  assert.equal(resumedA.thread.id, id)
  if (fixture) assert.equal(resumedA.modelProvider, 'continuity_fixture')
  await writeFile(
    join(root, 'resume-a.json'),
    JSON.stringify(resumedA, null, 2),
  )
  evidence.observations.returnToA = await inspect(back, id, 'return-a')
  evidence.observations.loadedAOnReturn = await request(
    controlA,
    'thread/loaded/list',
  )
  evidence.observations.siblingA = await inspect(
    controlA,
    sibling.thread.id,
    'sibling-a',
  )
  const rollout = await readFile(x.thread.path, 'utf8')
  evidence.observations.disk = {
    markerA: rollout.includes(markerA),
    markerB: rollout.includes(markerB),
  }
  evidence.observations.bothServersSurvived =
    children.length === 2 &&
    children.every(
      (child) => child.exitCode === null && child.signalCode === null,
    )
  assert(
    evidence.observations.bothServersSurvived,
    'A server unexpectedly exited before the resident return',
  )
  assert(
    evidence.observations.loadedAAfterRelease.data.includes(id),
    'A evicted the thread instead of retaining it',
  )
  assert(
    evidence.observations.loadedBAfterRelease.data.includes(id),
    'B evicted the thread instead of retaining it',
  )
  assert(
    evidence.observations.loadedAOnReturn.data.includes(sibling.thread.id),
    'The synthetic sibling was unexpectedly unloaded',
  )
  if (fixture) {
    await append(back, id, 'SYNTHETIC_RETURN_TO_RESIDENT_A')
    assert.equal(
      fixture.requests.length,
      4,
      'Unexpected fixture request count including the idle sibling',
    )
    const outbound = JSON.stringify(fixture.requests.at(-1).input)
    const carriesB = {
      user: outbound.includes(markerB),
      assistant: outbound.includes(replyB),
    }
    evidence.observations.residentOutbound = carriesB
    evidence.verdict =
      carriesB.user && carriesB.assistant
        ? 'fresh-outbound-context'
        : 'stale-outbound-context'

    const malformed = await request(controlB, 'thread/start', start)
    assert.equal(malformed.modelProvider, 'continuity_fixture')
    fixtureThreads.add(malformed.thread.id)
    const rejected = await fixtureTurn(
      controlB,
      malformed.thread.id,
      'SYNTHETIC_MALFORMED_CONTROL',
    )
    evidence.observations.malformedControl = {
      status: rejected.status,
      error: rejected.error,
    }
    assert.equal(
      rejected.status,
      'failed',
      'Malformed SSE was not recognized as a turn failure',
    )

    // A cold control distinguishes stale resident input from a bad fixture.
    // Only the probe's A server stops; B and all real app servers are untouched.
    await release(back, id)
    controlA.close()
    hostA.stop()
    await exits[0]
    const coldRegistry = new CodexServerHostRegistry(registryOptions)
    registries.push(coldRegistry)
    coldRegistry.setBinary(binary, version)
    const coldHost = coldRegistry.get({ account: { configDir: homes[0] } })
    const cold = await connect(coldHost)
    const resumedCold = await request(cold, 'thread/resume', {
      threadId: id,
      ...start,
    })
    assert.equal(resumedCold.thread.id, id)
    assert.equal(resumedCold.modelProvider, 'continuity_fixture')
    await append(cold, id, 'SYNTHETIC_COLD_CONTROL_A')
    const coldInput = JSON.stringify(fixture.requests.at(-1).input)
    evidence.observations.coldOutbound = {
      user: coldInput.includes(markerB),
      assistant: coldInput.includes(replyB),
    }
    assert(
      evidence.observations.coldOutbound.user &&
        evidence.observations.coldOutbound.assistant,
      'Cold control failed to carry B context',
    )
    const coldSibling = await connect(coldHost)
    const resumedSibling = await request(coldSibling, 'thread/resume', {
      threadId: sibling.thread.id,
      ...start,
    })
    assert.equal(resumedSibling.thread.id, sibling.thread.id)
    assert.equal(resumedSibling.modelProvider, 'continuity_fixture')
    await append(
      coldSibling,
      sibling.thread.id,
      'SYNTHETIC_IDLE_SIBLING_RESUMED',
    )
    const siblingInput = JSON.stringify(fixture.requests.at(-1).input)
    evidence.observations.coldSiblingOutbound = {
      user: siblingInput.includes(markerSibling),
      assistant: siblingInput.includes(replySibling),
    }
    assert(
      evidence.observations.coldSiblingOutbound.user &&
        evidence.observations.coldSiblingOutbound.assistant,
      'Idle sibling lost its context after the cold restart',
    )
    assert.equal(
      fixture.requests.length,
      7,
      'Unexpected fixture request count including controls and sibling',
    )
    assert.equal(fixture.errors.length, 0, 'Fixture received invalid requests')
    assert(fixture.connections.every((item) => item.address === '127.0.0.1'))
    assert(
      fixture.requests.every((item) => item.previousResponseId === null),
      'Cannot judge full input when a request refers to server-side prior context',
    )
  } else {
    evidence.verdict = 'inconclusive-model-context'
  }
  evidence.completed = true
} catch (error) {
  evidence.error = error.message
  process.exitCode = 1
} finally {
  for (const connection of connections) connection.close()
  for (const owned of registries) owned.stopAll()
  await Promise.all(exits)
  if (fixture) {
    evidence.fixture = {
      requests: fixture.requests,
      connections: fixture.connections,
      errors: fixture.errors,
    }
    await writeFile(
      join(root, 'outbound-inputs.json'),
      JSON.stringify(fixture.requests, null, 2),
    )
    await fixture.close()
  }
  evidence.ownedServersExited = children.every(
    (child) =>
      child.pid === undefined ||
      child.exitCode !== null ||
      child.signalCode !== null,
  )
  await writeFile(join(root, 'result.json'), JSON.stringify(evidence, null, 2))
  const { fixture: captured, ...summary } = evidence
  console.log(
    JSON.stringify(
      { ...summary, fixtureRequestCount: captured?.requests.length },
      null,
      2,
    ),
  )
}
