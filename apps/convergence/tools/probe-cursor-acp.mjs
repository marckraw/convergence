#!/usr/bin/env node
/**
 * Cursor ACP probe. Spawns a real `cursor-agent acp` and speaks Convergence's
 * ACP envelope at it, so the wire can be measured instead of guessed.
 *
 * This module runs on import — keep every testable part in
 * `probe-cursor-acp.pure.mjs`, which a test may import without spending
 * Marcin's Cursor plan.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import process from 'node:process'
import {
  HELP,
  buildCancelNotification,
  buildMethodNotFoundResponse,
  buildGuardTranscriptEntry,
  buildPermissionResponse,
  buildPromptRequest,
  buildRequestMessage,
  countGuardedAnswers,
  createTranscript,
  decidePermissionAnswer,
  encodeMessage,
  isResponse,
  isServerRequest,
  parseArgs,
  readConfigCurrentValue,
  readRecord,
  readString,
  redactPayload,
  summarizeOptions,
} from './probe-cursor-acp.pure.mjs'

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  console.log(HELP)
  process.exit(0)
}

if (args.model && !args.allowModelConfigMutation) {
  console.error(
    '--model requires --allow-model-config-mutation because Cursor ACP model changes can persist globally.',
  )
  process.exit(2)
}

const binary = args.binary ?? findBinary(['agent', 'cursor-agent'])
if (!binary) {
  console.error('Could not find agent or cursor-agent on PATH.')
  process.exit(1)
}

const cwd = args.cwd ?? process.cwd()
const startedAt = Date.now()
const transcript = createTranscript({ homeDir: homedir() })

const child = spawn(binary, ['acp'], {
  cwd,
  stdio: ['pipe', 'pipe', 'pipe'],
})

const client = createJsonRpcClient(child, {
  permissionResponse: args.permissionResponse ?? 'reject-once',
  timeoutMs: args.timeoutMs,
})

const summary = {
  binary,
  cwd,
  permissionResponse: args.permissionResponse,
  idleMs: args.idleMs,
  promptsSent: 0,
  initialized: null,
  authenticated: null,
  session: null,
  selectedMode: null,
  selectedModel: null,
  prompts: [],
  listResult: null,
  loadResult: null,
  cancelSent: null,
  guardedRequests: 0,
  permissionAnswers: client.permissionAnswers,
  notifications: client.notifications,
  serverRequests: client.serverRequests,
  stderr: client.stderr,
  processAliveAtEnd: null,
  childExit: null,
}

try {
  summary.initialized = await client.request('initialize', {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    },
    clientInfo: {
      name: 'convergence-cursor-acp-probe',
      version: '0.1.0',
    },
  })

  summary.authenticated = await client.request('authenticate', {
    methodId: 'cursor_login',
  })

  summary.session = await client.request('session/new', {
    cwd,
    mcpServers: [],
  })

  const sessionId = readString(summary.session, 'sessionId')
  if (!sessionId) {
    throw new Error('session/new did not return a sessionId')
  }

  if (args.mode) {
    summary.selectedMode = await client.request('session/set_mode', {
      sessionId,
      modeId: args.mode,
    })
  }

  if (args.model) {
    const currentModelId =
      readString(readRecord(summary.session)?.models, 'currentModelId') ??
      readConfigCurrentValue(summary.session, 'model')

    summary.selectedModel = {
      before: currentModelId,
      set: await client.request('session/set_config_option', {
        sessionId,
        configId: 'model',
        value: args.model,
      }),
      restored:
        currentModelId && currentModelId !== args.model
          ? await client.request('session/set_config_option', {
              sessionId,
              configId: 'model',
              value: currentModelId,
            })
          : null,
    }
  }

  // Every --prompt runs in order on this one process and this one session.
  for (let index = 0; index < args.prompts.length; index += 1) {
    if (index > 0 && args.idleMs > 0) await delay(args.idleMs)

    const text = args.prompts[index]
    const record = {
      index,
      prompt: text,
      notificationsBefore: client.notifications.length,
      serverRequestsBefore: client.serverRequests.length,
      result: null,
      error: null,
      processAliveAfter: null,
    }
    summary.prompts.push(record)
    summary.promptsSent += 1

    const promptPromise = client.prompt(sessionId, text).catch((error) => {
      record.error = error instanceof Error ? error.message : String(error)
      return null
    })

    // --probe-cancel fires during the first prompt only.
    if (args.probeCancel && index === 0) {
      await delay(args.cancelAfterMs)
      client.notify(buildCancelNotification(sessionId))
      summary.cancelSent = 'notification'
    }

    record.result = await promptPromise
    record.notificationsAfter = client.notifications.length
    record.serverRequestsAfter = client.serverRequests.length
    record.processAliveAfter = isChildAlive()
  }

  if (args.probeLoad) {
    summary.listResult = await client.request('session/list', { cwd })
    summary.loadResult = await client.request('session/load', {
      sessionId,
      cwd,
      mcpServers: [],
    })
  }

  if (args.lingerMs > 0) await delay(args.lingerMs)

  finalizeSummary()
  writeTranscript()
  printSummary(summary, args.json)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  finalizeSummary()
  writeTranscript()
  printSummary(summary, true)
  process.exitCode = 1
} finally {
  child.stdin.end()
  child.kill()
}

function isChildAlive() {
  return child.exitCode === null && child.signalCode === null
}

function finalizeSummary() {
  summary.processAliveAtEnd = isChildAlive()
  summary.childExit = { code: child.exitCode, signal: child.signalCode }
  summary.guardedRequests = countGuardedAnswers(summary.permissionAnswers)
}

/**
 * `--out` writes the transcript the collection already redacted on append, plus
 * a redacted summary. Nothing raw is in scope here to write by mistake.
 */
function writeTranscript() {
  if (!args.out) return
  const payload = {
    startedAt: new Date(startedAt).toISOString(),
    binary,
    cwd,
    promptsSent: summary.promptsSent,
    summary: redactPayload(summary, { homeDir: homedir() }),
    entries: transcript.entries(),
  }
  writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(
    `transcript (redacted): ${args.out} · ${transcript.length} entries`,
  )
}

function createJsonRpcClient(childProcess, options) {
  let nextId = 1
  const pending = new Map()
  const notifications = []
  const serverRequests = []
  const permissionAnswers = []
  const stderr = []

  const rl = createInterface({ input: childProcess.stdout })
  rl.on('line', (line) => {
    if (!line.trim()) return

    let message
    try {
      message = JSON.parse(line)
    } catch {
      const entry = { type: 'non-json-line', line }
      transcript.record({ at: elapsed(), direction: 'in', message: entry })
      notifications.push(redactPayload(entry, { homeDir: homedir() }))
      return
    }

    transcript.record({ at: elapsed(), direction: 'in', message })

    if (isResponse(message)) {
      const waiter = pending.get(message.id)
      if (!waiter) return
      clearTimeout(waiter.timeout)
      pending.delete(message.id)
      message.error
        ? waiter.reject(
            Object.assign(new Error(message.error.message ?? 'ACP error'), {
              rpcError: redactPayload(message.error, { homeDir: homedir() }),
            }),
          )
        : waiter.resolve(message.result)
      return
    }

    if (isServerRequest(message)) {
      serverRequests.push(redactPayload(message, { homeDir: homedir() }))
      handleServerRequest(message)
      return
    }

    notifications.push(redactPayload(message, { homeDir: homedir() }))
  })

  childProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    transcript.record({
      at: elapsed(),
      direction: 'stderr',
      message: { text },
    })
    stderr.push(redactPayload(text, { homeDir: homedir() }))
  })

  childProcess.on('exit', (code, signal) => {
    transcript.record({
      at: elapsed(),
      direction: 'event',
      message: { type: 'child-exit', code, signal },
    })
    for (const [, waiter] of pending) {
      clearTimeout(waiter.timeout)
      waiter.reject(
        new Error(
          `Cursor ACP exited before response: code=${code} signal=${signal}`,
        ),
      )
    }
    pending.clear()
  })

  function send(message) {
    transcript.record({ at: elapsed(), direction: 'out', message })
    childProcess.stdin.write(encodeMessage(message))
  }

  function awaitResponse(id, method) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Timed out waiting for ${method}`))
      }, options.timeoutMs)

      pending.set(id, { resolve, reject, timeout })
    })
  }

  /**
   * The ONE place the probe answers a permission request. Every answer is the
   * verdict of `decidePermissionAnswer`, which refuses anything naming a
   * private folder or a secrets file — there is no flag that switches that
   * off. `probe-cursor-acp.test.mjs` pins this as the only
   * `buildPermissionResponse(` call site in the file.
   */
  function handleServerRequest(message) {
    if (message.method === 'session/request_permission') {
      const decision = decidePermissionAnswerFor(message)
      if (decision.guarded) {
        transcript.record({
          at: elapsed(),
          direction: 'event',
          message: buildGuardTranscriptEntry(decision),
        })
      }
      permissionAnswers.push({
        toolCallId: readString(
          readRecord(message.params)?.toolCall,
          'toolCallId',
        ),
        optionId: decision.optionId,
        reason: decision.reason,
        guarded: decision.guarded,
        options: redactPayload(readRecord(message.params)?.options, {
          homeDir: homedir(),
        }),
      })
      send(buildPermissionResponse(message.id, decision.optionId))
      return
    }

    send(
      buildMethodNotFoundResponse(
        message.id,
        `Probe does not implement ${message.method}`,
      ),
    )
  }

  function decidePermissionAnswerFor(message) {
    return decidePermissionAnswer(
      readRecord(message.params),
      options.permissionResponse,
      { homeDir: homedir() },
    )
  }

  return {
    notifications,
    serverRequests,
    permissionAnswers,
    stderr,
    notify(message) {
      send(message)
    },
    request(method, params) {
      const id = nextId++
      send(buildRequestMessage(id, method, params))
      return awaitResponse(id, method)
    },
    prompt(sessionId, text) {
      const id = nextId++
      send(buildPromptRequest(id, sessionId, text))
      return awaitResponse(id, 'session/prompt')
    },
  }
}

function elapsed() {
  return Date.now() - startedAt
}

function printSummary(summary, asJson) {
  const redacted = redactPayload(summary, { homeDir: homedir() })

  if (asJson) {
    console.log(JSON.stringify(redacted, null, 2))
    return
  }

  console.log('Cursor ACP probe summary')
  console.log(`binary: ${summary.binary}`)
  console.log(`cwd: ${summary.cwd}`)
  console.log(
    `protocol: ${readString(summary.initialized, 'protocolVersion') ?? 'unknown'}`,
  )
  console.log(
    `session: ${readString(summary.session, 'sessionId') ?? 'unknown'}`,
  )
  console.log(
    `modes: ${summarizeOptions(readRecord(summary.session)?.modes?.availableModes)}`,
  )
  console.log(
    `models: ${summarizeOptions(readRecord(summary.session)?.models?.availableModels)}`,
  )
  console.log(`prompts sent: ${summary.promptsSent}`)
  console.log(`notifications: ${summary.notifications.length}`)
  console.log(`server requests: ${summary.serverRequests.length}`)
  console.log(`permission answers: ${summary.permissionAnswers.length}`)
  console.log(`guarded requests: ${summary.guardedRequests}`)
  console.log(`process alive at end: ${summary.processAliveAtEnd}`)

  for (const record of summary.prompts) {
    console.log(
      `prompt[${record.index}] stopReason: ${
        readString(record.result, 'stopReason') ?? 'none'
      }${record.error ? ` error: ${record.error}` : ''} alive: ${record.processAliveAfter}`,
    )
  }
}

function findBinary(names) {
  for (const name of names) {
    const result = spawnSync('which', [name], {
      encoding: 'utf8',
    })
    const path = result.stdout.trim()
    if (result.status === 0 && path) return path
  }

  return null
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
