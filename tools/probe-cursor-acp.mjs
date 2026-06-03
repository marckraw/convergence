#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import process from 'node:process'

const HELP = `Usage:
  node tools/probe-cursor-acp.mjs [options]

Options:
  --binary <path>                      Cursor CLI binary. Defaults to agent, then cursor-agent.
  --cwd <path>                         Working directory for the ACP session. Defaults to process cwd.
  --prompt <text>                      Send a session/prompt request after session/new.
  --mode <agent|plan|ask>              Set mode through session/set_mode after session/new.
  --model <acp-model-id>               Probe model selection through session/set_config_option.
  --allow-model-config-mutation        Required with --model because Cursor model config can persist globally.
  --permission-response <option-id>    Permission option to return. Defaults to reject-once.
  --probe-load                         Call session/list and session/load after session creation.
  --probe-cancel                       Send session/cancel while a prompt is running.
  --cancel-after-ms <number>           Delay before session/cancel. Defaults to 500.
  --timeout-ms <number>                Per-request timeout. Defaults to 30000.
  --json                               Print the full redacted probe summary as JSON.
  --help                               Show this help.

Safe default:
  Without --prompt or --model this only initializes ACP, authenticates, creates a session,
  and prints redacted capability/config summaries.
`

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
  initialized: null,
  authenticated: null,
  session: null,
  selectedMode: null,
  selectedModel: null,
  promptResult: null,
  promptError: null,
  listResult: null,
  loadResult: null,
  cancelResult: null,
  cancelError: null,
  notifications: client.notifications,
  serverRequests: client.serverRequests,
  stderr: client.stderr,
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

  if (args.prompt) {
    const promptPromise = client
      .request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: args.prompt }],
      })
      .catch((error) => {
        summary.promptError =
          error instanceof Error ? error.message : String(error)
        return null
      })

    if (args.probeCancel) {
      await delay(args.cancelAfterMs)
      try {
        summary.cancelResult = await client.request('session/cancel', {
          sessionId,
        })
      } catch (error) {
        summary.cancelError =
          error instanceof Error ? error.message : String(error)
      }
    }

    summary.promptResult = await promptPromise
    if (!summary.promptResult && summary.promptError && !args.probeCancel) {
      throw new Error(summary.promptError)
    }
  }

  if (args.probeLoad) {
    summary.listResult = await client.request('session/list', { cwd })
    summary.loadResult = await client.request('session/load', {
      sessionId,
      cwd,
      mcpServers: [],
    })
  }

  printSummary(summary, args.json)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  printSummary(summary, true)
  process.exitCode = 1
} finally {
  child.stdin.end()
  child.kill()
}

function createJsonRpcClient(childProcess, options) {
  let nextId = 1
  const pending = new Map()
  const notifications = []
  const serverRequests = []
  const stderr = []

  const rl = createInterface({ input: childProcess.stdout })
  rl.on('line', (line) => {
    if (!line.trim()) return

    let message
    try {
      message = JSON.parse(line)
    } catch {
      notifications.push({ type: 'non-json-line', line })
      return
    }

    if (isResponse(message)) {
      const waiter = pending.get(message.id)
      if (!waiter) return
      clearTimeout(waiter.timeout)
      pending.delete(message.id)
      message.error
        ? waiter.reject(new Error(message.error.message ?? 'ACP error'))
        : waiter.resolve(message.result)
      return
    }

    if (isServerRequest(message)) {
      serverRequests.push(redactPayload(message))
      handleServerRequest(childProcess, message, options)
      return
    }

    notifications.push(redactPayload(message))
  })

  childProcess.stderr.on('data', (chunk) => {
    stderr.push(chunk.toString())
  })

  childProcess.on('exit', (code, signal) => {
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

  return {
    notifications,
    serverRequests,
    stderr,
    request(method, params) {
      const id = nextId++
      childProcess.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
      )

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`Timed out waiting for ${method}`))
        }, options.timeoutMs)

        pending.set(id, { resolve, reject, timeout })
      })
    },
  }
}

function handleServerRequest(childProcess, message, options) {
  if (message.method === 'session/request_permission') {
    respond(childProcess, message.id, {
      outcome: {
        outcome: 'selected',
        optionId: options.permissionResponse,
      },
    })
    return
  }

  respondError(
    childProcess,
    message.id,
    `Probe does not implement ${message.method}`,
  )
}

function respond(childProcess, id, result) {
  childProcess.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n',
  )
}

function respondError(childProcess, id, message) {
  childProcess.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message,
      },
    }) + '\n',
  )
}

function printSummary(summary, asJson) {
  const redacted = redactPayload(summary)

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
  console.log(`notifications: ${summary.notifications.length}`)
  console.log(`server requests: ${summary.serverRequests.length}`)

  if (summary.promptResult) {
    console.log(
      `prompt stopReason: ${readString(summary.promptResult, 'stopReason') ?? 'unknown'}`,
    )
  }
}

function summarizeOptions(value) {
  const items = Array.isArray(value) ? value : []
  if (items.length === 0) return 'none'

  const names = items.slice(0, 8).map((item) => {
    if (typeof item === 'string') return item
    const record = readRecord(item)
    return (
      readString(record, 'id') ??
      readString(record, 'value') ??
      readString(record, 'modelId') ??
      readString(record, 'name') ??
      'unknown'
    )
  })

  return `${items.length} (${names.join(', ')}${items.length > 8 ? ', ...' : ''})`
}

function parseArgs(argv) {
  const parsed = {
    binary: null,
    cwd: null,
    prompt: null,
    mode: null,
    model: null,
    allowModelConfigMutation: false,
    permissionResponse: 'reject-once',
    probeLoad: false,
    probeCancel: false,
    cancelAfterMs: 500,
    timeoutMs: 30000,
    json: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--binary':
        parsed.binary = readArgValue(argv, ++index, arg)
        break
      case '--cwd':
        parsed.cwd = readArgValue(argv, ++index, arg)
        break
      case '--prompt':
        parsed.prompt = readArgValue(argv, ++index, arg)
        break
      case '--mode':
        parsed.mode = readArgValue(argv, ++index, arg)
        break
      case '--model':
        parsed.model = readArgValue(argv, ++index, arg)
        break
      case '--allow-model-config-mutation':
        parsed.allowModelConfigMutation = true
        break
      case '--permission-response':
        parsed.permissionResponse = readArgValue(argv, ++index, arg)
        break
      case '--probe-load':
        parsed.probeLoad = true
        break
      case '--probe-cancel':
        parsed.probeCancel = true
        break
      case '--cancel-after-ms':
        parsed.cancelAfterMs = Number(readArgValue(argv, ++index, arg))
        break
      case '--timeout-ms':
        parsed.timeoutMs = Number(readArgValue(argv, ++index, arg))
        break
      case '--json':
        parsed.json = true
        break
      case '--help':
      case '-h':
        parsed.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

function readArgValue(argv, index, name) {
  const value = argv[index]
  if (!value) throw new Error(`${name} requires a value`)
  return value
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

function readConfigCurrentValue(value, configId) {
  const configOptions = readRecord(value)?.configOptions
  if (!Array.isArray(configOptions)) return null

  for (const option of configOptions) {
    const record = readRecord(option)
    if (readString(record, 'id') !== configId) continue
    return (
      readString(record, 'currentValue') ??
      readString(record, 'value') ??
      readString(record, 'current')
    )
  }

  return null
}

function redactPayload(value, depth = 0, key = null) {
  if (key && isSensitiveKey(key)) return '[redacted]'
  if (key && isRawToolPayloadKey(key)) return summarizeRawPayload(value)
  if (typeof value === 'string') return truncate(value)
  if (typeof value !== 'object' || value === null) return value
  if (depth > 8) return '[truncated object]'

  if (Array.isArray(value)) {
    const items = value
      .slice(0, 20)
      .map((item) => redactPayload(item, depth + 1, key))
    if (value.length > 20) items.push(`[truncated ${value.length - 20} items]`)
    return items
  }

  const output = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    output[entryKey] = redactPayload(entryValue, depth + 1, entryKey)
  }
  return output
}

function summarizeRawPayload(value) {
  const record = readRecord(value)
  if (!record) return redactPayload(value, 1)

  const summary = {}
  for (const key of ['type', 'kind', 'title', 'status', 'command']) {
    const field = record[key]
    if (field !== undefined) summary[key] = redactPayload(field, 1, key)
  }

  if (typeof record.content === 'string') {
    summary.contentPreview = truncate(record.content)
    summary.contentBytes = Buffer.byteLength(record.content)
  }

  return Object.keys(summary).length > 0
    ? summary
    : '[redacted raw tool payload]'
}

function truncate(value) {
  if (value.length <= 240) return value
  return `${value.slice(0, 240)}... [truncated ${value.length - 240} chars]`
}

function isResponse(message) {
  return (
    message &&
    typeof message === 'object' &&
    'id' in message &&
    !('method' in message) &&
    ('result' in message || 'error' in message)
  )
}

function isServerRequest(message) {
  return (
    message &&
    typeof message === 'object' &&
    'id' in message &&
    typeof message.method === 'string'
  )
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null
}

function readString(value, key) {
  const record = readRecord(value)
  const field = record?.[key]
  if (typeof field === 'number') return String(field)
  return typeof field === 'string' && field.trim() ? field.trim() : null
}

function isSensitiveKey(key) {
  const normalized = key.toLowerCase()
  return (
    normalized.includes('token') ||
    normalized.includes('apikey') ||
    normalized.includes('api_key') ||
    normalized.includes('authorization') ||
    normalized.includes('email') ||
    normalized === 'account'
  )
}

function isRawToolPayloadKey(key) {
  const normalized = key.toLowerCase()
  return normalized === 'rawoutput' || normalized === 'rawinput'
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
