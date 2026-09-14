#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { startContinuityFixture } from './codex-continuity-fixture.mjs'

// MAR-3012 Qa/Qb: a synthetic loopback turn, deliberately unacknowledged,
// whose only subscriber goes away. No credentials or external model requests.
const root = await mkdtemp(join(tmpdir(), 'cvg-lost-ack-stop-'))
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binary = process.env.CVG_CODEX_BINARY
assert(binary, 'Select the exact Codex binary with CVG_CODEX_BINARY')
const evidence = {
  root,
  version: execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim(),
  nodeVersion: process.version,
  externalModelTurns: 0,
}
let reached, release
const requested = new Promise((r) => {
  reached = r
})
const held = new Promise((r) => {
  release = r
})
const fixture = await startContinuityFixture({
  onRequest: async () => {
    reached()
    await held
  },
})
const children = [],
  exits = [],
  connections = []
let registry
try {
  const home = join(root, 'account-a')
  const userHome = join(root, 'user-home')
  await mkdir(home)
  await mkdir(userHome)
  await writeFile(
    join(home, 'config.toml'),
    `cli_auth_credentials_store = "file"\nmodel_provider = "continuity_fixture"\nmodel = "cvg-continuity-fixture"\n[model_providers.continuity_fixture]\nname = "Loopback fixture"\nbase_url = "${fixture.baseUrl('account-a')}"\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\n[analytics]\nenabled = false\n`,
  )
  const entry = join(root, 'entry.mjs'),
    bundle = join(root, 'host.cjs')
  await writeFile(
    entry,
    `export { CodexServerHostRegistry } from ${JSON.stringify(join(appRoot, 'electron/backend/provider/codex/codex-server-host.ts'))};\nexport { connectCodexWebSocket } from ${JSON.stringify(join(appRoot, 'electron/backend/provider/codex/codex-ws-transport.ts'))};`,
  )
  await build({
    entryPoints: [entry],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    external: ['electron', 'better-sqlite3'],
    logLevel: 'warning',
  })
  const { CodexServerHostRegistry, connectCodexWebSocket } = await import(
    pathToFileURL(bundle).href
  )
  let first = true
  registry = new CodexServerHostRegistry({
    cwd: root,
    spawnProcess: (cmd, args, opts) => {
      assert.equal(opts.env.CODEX_HOME, home)
      const child = spawn(cmd, args, {
        ...opts,
        env: {
          PATH: process.env.PATH,
          HOME: userHome,
          TMPDIR: root,
          CODEX_HOME: home,
        },
      })
      children.push(child)
      exits.push(
        new Promise((r) => {
          child.once('exit', r)
          child.once('error', r)
        }),
      )
      return child
    },
    connectTransport: async (url) => {
      const transport = await connectCodexWebSocket(url)
      if (!first) return transport
      first = false
      let lostId
      return {
        ...transport,
        send: (chunk) => {
          for (const line of chunk.trim().split('\n')) {
            const msg = JSON.parse(line)
            if (msg.method === 'turn/start') lostId = msg.id
          }
          transport.send(chunk)
        },
        onData: (handler) =>
          transport.onData((chunk) => {
            for (const line of chunk.trim().split('\n')) {
              const msg = JSON.parse(line)
              if (lostId !== undefined && msg.id === lostId) {
                evidence.ackDropped = true
                continue
              }
              handler(line + '\n')
            }
          }),
      }
    },
  })
  registry.setBinary(binary, evidence.version)
  const host = registry.get({ account: { configDir: home } })
  const a = await host.connect()
  connections.push(a)
  assert.equal(
    (await a.rpc.request('account/read', { refreshToken: false })).account,
    null,
  )
  const start = await a.rpc.request('thread/start', {
    model: 'cvg-continuity-fixture',
    modelProvider: 'continuity_fixture',
    cwd: root,
    approvalPolicy: 'never',
    sandbox: 'read-only',
    ephemeral: false,
  })
  const id = start.thread.id
  evidence.threadId = id
  const clientId = 'synthetic-lost-ack-control'
  const pending = a.rpc
    .request('turn/start', {
      threadId: id,
      clientUserMessageId: clientId,
      input: [{ type: 'text', text: 'Synthetic held turn.' }],
    })
    .catch((e) => e)
  await Promise.race([
    requested,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Fixture did not receive its request')),
        15000,
      ).unref(),
    ),
  ])
  assert.equal(evidence.ackDropped, true)
  a.close()
  await pending
  const control = await host.connect()
  connections.push(control)
  const read = await control.rpc.request('thread/read', {
    threadId: id,
    includeTurns: true,
  })
  evidence.afterSocketClose = read.thread.status
  assert.equal(read.thread.status.type, 'active')
  const turns = await control.rpc.request('thread/turns/list', { threadId: id })
  const turn = turns.data.find((t) =>
    t.items?.some((item) => item.clientId === clientId),
  )
  assert(turn, 'The landed turn must carry our client message id')
  evidence.ownedTurn = { id: turn.id, status: turn.status }
  evidence.interrupt = await control.rpc.request('turn/interrupt', {
    threadId: id,
    turnId: turn.id,
  })
  const deadline = Date.now() + 5000
  do {
    const after = await control.rpc.request('thread/read', {
      threadId: id,
      includeTurns: false,
    })
    evidence.afterInterrupt = after.thread.status
    if (after.thread.status.type === 'idle') break
    await new Promise((r) => setTimeout(r, 50))
  } while (Date.now() < deadline)
  assert.equal(evidence.afterInterrupt.type, 'idle')
  evidence.verdict = 'unsubscribed-owned-turn-interrupt-passed'
} catch (error) {
  evidence.error = error.message
  process.exitCode = 1
} finally {
  release()
  for (const c of connections) c.close()
  await registry?.stopAll()
  await Promise.all(exits)
  await fixture.close()
  evidence.ownedServersExited = children.every(
    (c) => c.exitCode !== null || c.signalCode !== null,
  )
  await writeFile(join(root, 'result.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
}
