#!/usr/bin/env node
import { execFileSync, spawnSync } from 'child_process'
import { randomUUID } from 'crypto'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { build } from 'esbuild'

/**
 * The live canary for the resident Codex app-server (MAR-2823).
 *
 * Opt-in and never part of the five gates: it starts the REAL `codex
 * app-server` and is therefore as slow as a cold start (7–25s on a shared
 * `~/.codex`, ~70ms on a healthy one) and as dependent on the machine's Codex
 * install. What it proves is the one thing hermetic tests cannot: that the
 * whole design holds against the actual binary —
 *
 *   1. the host spawns ONE process for two sessions and everything else;
 *   2. `/readyz` answers 200 without an `Origin`;
 *   3. two sessions each keep their own thread id despite the broadcast;
 *   4. a thread with no turn refuses `thread/resume` with "no rollout found",
 *      the wording the recovery path reads;
 *   5. `thread/unsubscribe` answers with a status, not an error;
 *   6. the process table shows exactly one `codex app-server`, and none after
 *      the host is stopped.
 *
 * The reset case sends two short model turns and writes their rollouts.
 * It checks memory isolation on the same connection (MAR-2819).
 *
 * Usage: `node tools/run-codex-server-canary.mjs`
 */

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The binary the app resolves — a login shell's PATH, never the repo's. */
function resolveCodexBinary() {
  if (process.env.CVG_CODEX_BINARY) return process.env.CVG_CODEX_BINARY
  const shell = process.env.SHELL || '/bin/zsh'
  const found = execFileSync(shell, ['-lic', 'command -v codex'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('/'))
    .pop()
  if (!found) throw new Error('codex was not found on the login shell PATH')
  return found
}

/**
 * How many app-servers are running, counted as *servers* rather than as
 * processes.
 *
 * `codex` on npm is a Node shim that execs the vendored Rust binary, so one
 * server is always two rows in `ps`. Counting rows says "2" for a single
 * healthy server, which is exactly the assertion this canary exists to make —
 * so the child rows are dropped by parentage, not by pattern.
 */
function countAppServers() {
  const output = spawnSync('ps', ['-Ao', 'pid,ppid,command'], {
    encoding: 'utf8',
  })
  const rows = (output.stdout ?? '')
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((match) => match !== null)
    .filter(
      (match) =>
        match[3].includes('app-server') &&
        match[3].includes('codex') &&
        !match[3].includes('run-codex-server-canary'),
    )
    .map((match) => ({ pid: match[1], ppid: match[2] }))

  const pids = new Set(rows.map((row) => row.pid))
  return rows.filter((row) => !pids.has(row.ppid)).length
}

/** Wait for the actual completed turn, including its answer, rather than its ack. */
async function answerOnThread(rpc, threadId, text) {
  let answer = ''
  let finish
  let fail
  const completion = new Promise((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  // Handle a failure while the turn/start acknowledgement is still pending.
  void completion.catch(() => {})
  const timer = setTimeout(
    () => fail(new Error('Memory canary turn did not complete within 120s')),
    120_000,
  )
  rpc.onNotification((method, params) => {
    if (params?.threadId !== threadId) return
    if (method === 'item/completed' && params.item?.type === 'agentMessage') {
      answer += params.item.text ?? ''
    }
    if (method === 'turn/completed') {
      if (params.turn?.status !== 'completed')
        fail(
          new Error(
            `Memory canary turn ended ${params.turn?.status}: ${params.turn?.error?.message ?? 'no reason supplied'}`,
          ),
        )
      else finish(answer.trim())
    }
  })
  rpc.onServerRequest((id) =>
    rpc.respondError(
      id,
      -32601,
      'This memory canary uses no tools or interactions',
    ),
  )
  try {
    await rpc.request('turn/start', {
      threadId,
      input: [{ type: 'text', text }],
    })
    return await completion
  } finally {
    clearTimeout(timer)
    rpc.onNotification(() => {})
  }
}

const outDir = mkdtempSync(join(tmpdir(), 'cvg-codex-canary-'))
const bundlePath = join(outDir, 'codex-server-host.cjs')

let exitCode = 1
/**
 * Set as soon as a registry exists, cleared once it has been stopped: a canary
 * that throws mid-run must not leave a real app-server behind — the first
 * version of this script did exactly that, and the leaked process then showed
 * up in its own next run's count.
 */
let stopServers = null
try {
  await build({
    entryPoints: [
      join(
        appRoot,
        'electron',
        'backend',
        'provider',
        'codex',
        'codex-server-host.ts',
      ),
    ],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'better-sqlite3'],
    logLevel: 'warning',
  })

  const { CodexServerHostRegistry } = await import(`file://${bundlePath}`)

  const binaryPath = resolveCodexBinary()
  const version = execFileSync(binaryPath, ['--version'], {
    encoding: 'utf8',
  }).trim()
  console.log(`codex: ${binaryPath} (${version})`)

  const before = countAppServers()
  if (before > 0) {
    console.log(
      `NOTE: ${before} codex app-server process(es) were already running; the count assertions allow for them.`,
    )
  }

  const registry = new CodexServerHostRegistry({ appVersion: 'canary' })
  stopServers = () => registry.stopAll()
  registry.setBinary(binaryPath, version)
  const host = registry.get({ account: null })

  const startedAt = Date.now()
  const [first, second] = await Promise.all([host.connect(), host.connect()])
  console.log(`two connections up after ${Date.now() - startedAt}ms`)

  const checks = []
  const check = (name, passed, detail = '') => {
    checks.push({ name, passed, detail })
    console.log(
      `${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`,
    )
  }

  check(
    'both connections belong to the same server generation',
    first.generation === second.generation,
    `generations ${first.generation} / ${second.generation}`,
  )

  const permission = { approvalPolicy: 'never', sandbox: 'read-only' }
  const cwd = outDir
  const firstThread = await first.rpc.request('thread/start', {
    cwd,
    ...permission,
  })
  const secondThread = await second.rpc.request('thread/start', {
    cwd,
    ...permission,
  })
  const firstId = firstThread?.thread?.id ?? firstThread?.threadId
  const secondId = secondThread?.thread?.id ?? secondThread?.threadId

  check(
    'each session keeps its own thread id',
    Boolean(firstId) && Boolean(secondId) && firstId !== secondId,
    `${firstId} / ${secondId}`,
  )

  // Readiness, without an Origin header — with one the server answers 403.
  const readyUrl = host.address()?.readyUrl
  if (readyUrl) {
    const response = await fetch(readyUrl)
    check(
      '/readyz answers 200',
      response.status === 200,
      `${readyUrl} -> ${response.status}`,
    )
    const forbidden = await fetch(readyUrl, {
      headers: { Origin: 'http://localhost' },
    })
    check(
      '/readyz answers 403 to a request carrying an Origin',
      forbidden.status === 403,
      `-> ${forbidden.status}`,
    )
  }

  // A thread with no turn has no rollout; the recovery path reads this wording.
  const third = await host.connect()
  let resumeError = null
  try {
    await third.rpc.request('thread/resume', {
      threadId: firstId,
      cwd,
      ...permission,
    })
  } catch (err) {
    resumeError = err instanceof Error ? err.message : String(err)
  }
  check(
    'resuming a thread with no turn says "no rollout found"',
    Boolean(resumeError && resumeError.includes('no rollout found')),
    resumeError ?? 'resume unexpectedly succeeded',
  )

  const memoryStartedAt = Date.now()
  const phrase = `cvg-memory-${randomUUID()}`
  const firstAnswer = await answerOnThread(
    first.rpc,
    firstId,
    `Remember this memory-test phrase: ${phrase}. Reply with exactly that phrase. Do not use tools.`,
  )
  const replacement = await first.rpc.request('thread/start', {
    cwd,
    ...permission,
  })
  const replacementId = replacement?.thread?.id ?? replacement?.threadId
  await first.rpc.request('thread/unsubscribe', { threadId: firstId })
  const secondAnswer = await answerOnThread(
    first.rpc,
    replacementId,
    'What was the memory-test phrase given earlier in THIS conversation? Reply with it if present, otherwise reply exactly NO_PRIOR_PHRASE. Do not use tools.',
  )
  check(
    'new thread has no prior memory — reusing the first thread and subscription turns red',
    firstAnswer.includes(phrase) &&
      replacementId !== firstId &&
      secondAnswer.includes('NO_PRIOR_PHRASE'),
    `${Date.now() - memoryStartedAt}ms; learned=${firstAnswer.includes(phrase)}; newThread=${replacementId !== firstId}; answer=${JSON.stringify(secondAnswer)}`,
  )
  const unsubscribed = await first.rpc.request('thread/unsubscribe', {
    threadId: replacementId,
  })
  check(
    'replacement thread/unsubscribe answers unsubscribed — target old thread turns red',
    unsubscribed?.status === 'unsubscribed',
    JSON.stringify(unsubscribed),
  )

  const during = countAppServers()
  check(
    'exactly one codex app-server is running',
    during - before === 1,
    `${during} running (${before} before the canary)`,
  )

  first.close()
  second.close()
  third.close()
  stopServers = null
  registry.stopAll()
  await new Promise((r) => setTimeout(r, 1_000))

  const after = countAppServers()
  check(
    'the server is gone once the app stops it',
    after === before,
    `${after} running (${before} before the canary)`,
  )

  const failed = checks.filter((entry) => !entry.passed)
  exitCode = failed.length === 0 ? 0 : 1
  console.log(
    failed.length === 0
      ? `\nPASSED — ${checks.length} checks`
      : `\nFAILED — ${failed.length}/${checks.length} checks`,
  )
} catch (error) {
  console.error('canary error:', error)
} finally {
  stopServers?.()
  rmSync(outDir, { recursive: true, force: true })
}

process.exit(exitCode)
