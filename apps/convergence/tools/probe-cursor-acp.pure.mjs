/**
 * Side-effect-free half of the Cursor ACP probe (MAR-3239).
 *
 * Importing this module must never spawn a process, read a file or touch the
 * network: `probe-cursor-acp.test.mjs` imports it, and the probe's sibling
 * `probe-cursor-acp.mjs` starts a real `cursor-agent` at import time — which
 * would spend Marcin's Cursor plan from a test run. Everything here is a pure
 * function of its arguments: argument parsing, JSON-RPC message builders,
 * permission-option selection, the permission path guard and redaction.
 *
 * Node builtins are deliberately not imported here. `redactPayload` takes the
 * home directory as an argument rather than calling `os.homedir()` so the
 * scrubber can be tested against a fixed home.
 */

const REDACTED = '[redacted]'
const REDACTED_EMAIL = '[redacted-email]'
const REDACTED_TOKEN = '[redacted-token]'
const TRUNCATE_AT = 240
const MAX_ARRAY_ITEMS = 200
const MAX_DEPTH = 8

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g
const PREFIXED_SECRET_PATTERN =
  /\b(?:sk|pk|ghp|gho|ghu|ghs|ghr|xoxb|xoxp|key|token)[-_][A-Za-z0-9_-]{12,}\b/gi
const LONG_OPAQUE_PATTERN = /\b[A-Za-z0-9_-]{40,}\b/g

export const HELP = `Usage:
  node tools/probe-cursor-acp.mjs [options]

Options:
  --binary <path>                      Cursor CLI binary. Defaults to agent, then cursor-agent.
  --cwd <path>                         Working directory for the ACP session. Defaults to process cwd.
  --prompt <text>                      Send a session/prompt request after session/new.
                                       Repeatable: every --prompt runs in order on ONE process
                                       and ONE session.
  --idle-ms <number>                   Idle delay inserted between consecutive prompts. Defaults to 0.
  --linger-ms <number>                 Stay connected this long before exiting, to catch late
                                       notifications (the command catalog arrives ~1.6s after
                                       session/new). Costs no prompt. Defaults to 0.
  --mode <agent|plan|ask>              Set mode through session/set_mode after session/new.
  --model <acp-model-id>               Probe model selection through session/set_config_option.
  --allow-model-config-mutation        Required with --model because Cursor model config can persist globally.
  --permission-response <option-id>    Permission option to return. Defaults to reject-once.
                                       The literal first-allow picks the first offered option
                                       whose kind allows.
  --probe-load                         Call session/list and session/load after session creation.
  --probe-cancel                       Send session/cancel (as a notification) while a prompt is running.
  --cancel-after-ms <number>           Delay before session/cancel. Defaults to 500.
  --timeout-ms <number>                Per-request timeout. Defaults to 30000.
  --out <file>                         Write the redacted transcript as JSON. Never written raw.
  --json                               Print the full redacted probe summary as JSON.
  --help                               Show this help.

Safe default:
  Without --prompt or --model this only initializes ACP, authenticates, creates a session,
  and prints redacted capability/config summaries.
`

/** The sentinel accepted by --permission-response to auto-approve. */
export const FIRST_ALLOW = 'first-allow'

export function parseArgs(argv) {
  const parsed = {
    binary: null,
    cwd: null,
    prompts: [],
    idleMs: 0,
    lingerMs: 0,
    mode: null,
    model: null,
    allowModelConfigMutation: false,
    permissionResponse: 'reject-once',
    probeLoad: false,
    probeCancel: false,
    cancelAfterMs: 500,
    timeoutMs: 30000,
    out: null,
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
        parsed.prompts.push(readArgValue(argv, ++index, arg))
        break
      case '--idle-ms':
        parsed.idleMs = readNumberArgValue(argv, ++index, arg)
        break
      case '--linger-ms':
        parsed.lingerMs = readNumberArgValue(argv, ++index, arg)
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
        parsed.cancelAfterMs = readNumberArgValue(argv, ++index, arg)
        break
      case '--timeout-ms':
        parsed.timeoutMs = readNumberArgValue(argv, ++index, arg)
        break
      case '--out':
        parsed.out = readArgValue(argv, ++index, arg)
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

function readNumberArgValue(argv, index, name) {
  const value = Number(readArgValue(argv, index, name))
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} requires a non-negative number`)
  }
  return value
}

// --- JSON-RPC message builders ------------------------------------------------

export function buildRequestMessage(id, method, params) {
  return { jsonrpc: '2.0', id, method, params }
}

/**
 * A JSON-RPC **notification** carries no `id`; that absence is the whole point.
 * `session/cancel` sent as a request answers `-32601 Method not found` on CLI
 * 2026.06.03-0bbb28e (see docs/architecture/cursor-acp-surface.md), so this
 * builder must never grow an `id` field.
 */
export function buildNotificationMessage(method, params) {
  return { jsonrpc: '2.0', method, params }
}

export function buildCancelNotification(sessionId) {
  return buildNotificationMessage('session/cancel', { sessionId })
}

export function buildPromptRequest(id, sessionId, text) {
  return buildRequestMessage(id, 'session/prompt', {
    sessionId,
    prompt: [{ type: 'text', text }],
  })
}

export function buildPermissionResponse(id, optionId) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      outcome:
        optionId === null || optionId === undefined
          ? { outcome: 'cancelled' }
          : { outcome: 'selected', optionId },
    },
  }
}

export function buildMethodNotFoundResponse(id, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message },
  }
}

export function encodeMessage(message) {
  return `${JSON.stringify(message)}\n`
}

// --- permission option selection ---------------------------------------------

/**
 * Resolve --permission-response against the options the agent actually offered.
 * `first-allow` mirrors the app's auto-approve: take the first option whose
 * ACP `kind` allows (`allow_once`, `allow_always`, …). Any other value is an
 * option id echoed back verbatim, which is how the probe has always behaved.
 * Returns `{ optionId, reason }`; a null `optionId` means answer `cancelled`.
 */
export function selectPermissionOptionId(options, permissionResponse) {
  if (permissionResponse !== FIRST_ALLOW) {
    return { optionId: permissionResponse, reason: 'configured-option-id' }
  }

  const items = Array.isArray(options) ? options : []
  for (const item of items) {
    const record = readRecord(item)
    const kind = typeof record?.kind === 'string' ? record.kind : null
    const id = typeof record?.optionId === 'string' ? record.optionId : null
    if (kind && id && kind.toLowerCase().startsWith('allow')) {
      return { optionId: id, reason: `first-allow:${kind}` }
    }
  }

  return { optionId: null, reason: 'first-allow:no-allow-option-offered' }
}

// --- permission guard (MAR-3246) ----------------------------------------------

/**
 * Folders this crew never reads. The fence lives on the answering side because
 * the probe auto-approves whatever the PROBED model asks for: during MAR-3239
 * probe 2 the model asked twice to list file names under `~/.cursor` and
 * `~/.claude` and `--permission-response first-allow` approved both. A brief
 * binds a horse; it does not bind the agent on the other end of the wire.
 */
const GUARDED_HOME_FOLDERS = ['.cursor', '.claude', '.codex', '.convergence']

/** Dot-directories and rc files that carry credentials wherever they sit. */
const GUARDED_SEGMENTS = ['.ssh', '.aws', '.npmrc', '.netrc']

/** Matched anywhere in a string rather than as a whole path segment. */
const GUARDED_SUBSTRINGS = [
  { pattern: 'auth.json', needle: 'auth.json' },
  { pattern: 'credentials', needle: 'credentials' },
  { pattern: 'Keychain', needle: 'keychain' },
  { pattern: 'security find-', needle: 'security find-' },
]

/** Everything a path segment may hold; anything else separates two segments. */
const TOKEN_SEPARATOR = /[^a-z0-9._~$-]+/

/**
 * The single decision behind every permission answer the probe sends.
 *
 * Deny by default on a match: if any string anywhere inside the request's
 * `toolCall` names a private folder or a secrets file, the answer is a reject
 * (or `cancelled` when no reject option is offered), whatever
 * `--permission-response` says. `homeDir` is an argument, not `os.homedir()`,
 * so this stays pure — and it is load-bearing: it is what turns an absolute
 * `/Users/x/.claude/skills` back into the `~/.claude` the fence names.
 *
 * Returns `{ optionId, reason, guarded, toolTitle }`; `guarded` is the matched
 * pattern, or null when the request passed.
 */
export function decidePermissionAnswer(
  request,
  permissionResponse,
  options = {},
) {
  const homeDir =
    typeof options.homeDir === 'string' && options.homeDir
      ? options.homeDir
      : null
  const toolCall = readToolCall(request)
  const offered = readPermissionOptions(request)
  const toolTitle = readString(toolCall, 'title')
  const guarded = matchGuardedPattern(toolCall, homeDir)

  if (guarded) {
    return {
      optionId: selectRejectOptionId(offered),
      reason: `guarded:${guarded}`,
      guarded,
      toolTitle,
    }
  }

  const { optionId, reason } = selectPermissionOptionId(
    offered,
    permissionResponse,
  )
  return { optionId, reason, guarded: null, toolTitle }
}

/** The transcript's record that a request was refused, before redaction. */
export function buildGuardTranscriptEntry(decision) {
  const record = readRecord(decision)
  return {
    kind: 'guard',
    pattern: record?.guarded ?? null,
    toolTitle: record?.toolTitle ?? null,
  }
}

/** How many answers the guard turned into refusals, for the printed summary. */
export function countGuardedAnswers(permissionAnswers) {
  const items = Array.isArray(permissionAnswers) ? permissionAnswers : []
  return items.filter((item) => Boolean(readRecord(item)?.guarded)).length
}

/**
 * Accept either the `session/request_permission` params or the whole JSON-RPC
 * message. A caller that hands over the message and finds no `toolCall` would
 * see an empty search and an ALLOW — silence that opens the fence — so the
 * unwrap is part of the guard, not a convenience.
 */
function readToolCall(request) {
  const record = readRecord(request)
  if (!record) return null
  return (
    readRecord(record.toolCall) ??
    readRecord(readRecord(record.params)?.toolCall)
  )
}

function readPermissionOptions(request) {
  const record = readRecord(request)
  if (!record) return []
  if (Array.isArray(record.options)) return record.options
  const nested = readRecord(record.params)?.options
  return Array.isArray(nested) ? nested : []
}

function selectRejectOptionId(options) {
  const items = Array.isArray(options) ? options : []

  for (const item of items) {
    const record = readRecord(item)
    const kind = readString(record, 'kind')
    const id = readString(record, 'optionId')
    if (id && kind && kind.toLowerCase() === 'reject_once') return id
  }

  for (const item of items) {
    const id = readString(readRecord(item), 'optionId')
    if (id && id.toLowerCase() === 'reject-once') return id
  }

  return null
}

/**
 * The matched pattern, or null. Every string anywhere under `toolCall` is
 * searched — title, content text, `rawInput` at any depth, locations, and the
 * keys themselves — because the command segments arrived in `content` on one
 * probe and there is no field the next CLI version has to keep using.
 */
function matchGuardedPattern(toolCall, homeDir) {
  if (!toolCall) return null

  const strings = []
  collectStrings(toolCall, strings, new WeakSet())
  const prepared = strings.map((text) => {
    const normalized = normalizeForMatch(text, homeDir)
    return {
      normalized,
      tokens: normalized.split(TOKEN_SEPARATOR).filter(Boolean),
    }
  })

  for (const folder of GUARDED_HOME_FOLDERS) {
    if (prepared.some(({ tokens }) => hasHomeRootedSegment(tokens, folder))) {
      return `~/${folder}`
    }
  }

  for (const folder of GUARDED_HOME_FOLDERS) {
    if (prepared.some(({ tokens }) => tokens.includes(folder))) return folder
  }

  if (prepared.some(({ tokens }) => tokens.some(isDotEnvSegment))) return '.env'

  for (const segment of GUARDED_SEGMENTS) {
    if (prepared.some(({ tokens }) => tokens.includes(segment))) return segment
  }

  for (const { pattern, needle } of GUARDED_SUBSTRINGS) {
    if (prepared.some(({ normalized }) => normalized.includes(needle))) {
      return pattern
    }
  }

  return null
}

function collectStrings(value, output, seen) {
  if (typeof value === 'string') {
    output.push(value)
    return
  }
  if (!value || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output, seen)
    return
  }

  for (const [key, entry] of Object.entries(value)) {
    output.push(key)
    collectStrings(entry, output, seen)
  }
}

/**
 * Lowercase, collapse runs of spaces and tabs (so `security  find-` still reads
 * as `security find-`), and fold every spelling of the home directory — the
 * absolute path, `$HOME`, `${HOME}` — into the single `~` the patterns name.
 */
function normalizeForMatch(text, homeDir) {
  let output = text.toLowerCase()

  const home = homeDir ? homeDir.toLowerCase().replace(/\/+$/, '') : ''
  if (home) output = output.split(home).join('~')
  output = output.split('${home}').join('~').split('$home').join('~')

  return output.replace(/[ \t]+/g, ' ')
}

function hasHomeRootedSegment(tokens, folder) {
  return tokens.some(
    (token, index) => token === folder && tokens[index - 1] === '~',
  )
}

/**
 * `.env` and `.env.local` are secrets; `environment.md` and `import.meta.env`
 * are not. The difference is the whole path segment, never a substring.
 */
function isDotEnvSegment(token) {
  return token === '.env' || token.startsWith('.env.')
}

// --- redaction ----------------------------------------------------------------

/**
 * Scrub a payload for the transcript. Redacts by key (token/apikey/email/…),
 * summarizes raw tool payloads, and scrubs by **value** so an email, the home
 * directory or a token-shaped run never reaches a file even when it arrives
 * under an innocent key. `homeDir` is passed in so this stays pure.
 */
export function redactPayload(value, options = {}) {
  const homeDir =
    typeof options.homeDir === 'string' && options.homeDir
      ? options.homeDir
      : null
  return redactValue(value, { homeDir }, 0, null)
}

function redactValue(value, ctx, depth, key) {
  if (key && isSensitiveKey(key)) return REDACTED
  if (key && isRawToolPayloadKey(key)) return summarizeRawPayload(value, ctx)
  if (typeof value === 'string') return truncate(scrubString(value, ctx))
  if (typeof value !== 'object' || value === null) return value
  if (depth > MAX_DEPTH) return '[truncated object]'

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactValue(item, ctx, depth + 1, key))
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[truncated ${value.length - MAX_ARRAY_ITEMS} items]`)
    }
    return items
  }

  const output = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    output[entryKey] = redactValue(entryValue, ctx, depth + 1, entryKey)
  }
  return output
}

export function scrubString(value, ctx = {}) {
  let output = value
  if (ctx.homeDir) output = output.split(ctx.homeDir).join('~')
  output = output.replace(EMAIL_PATTERN, REDACTED_EMAIL)
  output = output.replace(JWT_PATTERN, REDACTED_TOKEN)
  output = output.replace(PREFIXED_SECRET_PATTERN, REDACTED_TOKEN)
  output = output.replace(LONG_OPAQUE_PATTERN, REDACTED_TOKEN)
  return output
}

function summarizeRawPayload(value, ctx) {
  const record = readRecord(value)
  if (!record) return redactValue(value, ctx, 1, null)

  const summary = {}
  for (const key of ['type', 'kind', 'title', 'status', 'command']) {
    const field = record[key]
    if (field !== undefined) summary[key] = redactValue(field, ctx, 1, key)
  }

  if (typeof record.content === 'string') {
    summary.contentPreview = truncate(scrubString(record.content, ctx))
    summary.contentBytes = record.content.length
  }

  return Object.keys(summary).length > 0
    ? summary
    : '[redacted raw tool payload]'
}

export function truncate(value) {
  if (value.length <= TRUNCATE_AT) return value
  return `${value.slice(0, TRUNCATE_AT)}... [truncated ${value.length - TRUNCATE_AT} chars]`
}

export function isSensitiveKey(key) {
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

export function isRawToolPayloadKey(key) {
  const normalized = key.toLowerCase()
  return normalized === 'rawoutput' || normalized === 'rawinput'
}

// --- message shape predicates --------------------------------------------------

export function isResponse(message) {
  return Boolean(
    message &&
    typeof message === 'object' &&
    'id' in message &&
    !('method' in message) &&
    ('result' in message || 'error' in message),
  )
}

export function isServerRequest(message) {
  return Boolean(
    message &&
    typeof message === 'object' &&
    'id' in message &&
    typeof message.method === 'string',
  )
}

export function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null
}

export function readString(value, key) {
  const record = readRecord(value)
  const field = record?.[key]
  if (typeof field === 'number') return String(field)
  return typeof field === 'string' && field.trim() ? field.trim() : null
}

export function readConfigCurrentValue(value, configId) {
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

export function summarizeOptions(value) {
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

// --- transcript ----------------------------------------------------------------

/**
 * The probe's transcript, as a closed collection.
 *
 * `--out` writes this to disk, and the brief forbids a raw write. The entry
 * array is therefore private and `record()` is the only way in — it redacts
 * every message as it is appended, so no code path can leave an unscrubbed
 * payload sitting in memory waiting for the writer. Do not add an accessor
 * that returns the array before redaction.
 */
export function createTranscript({ homeDir } = {}) {
  const entries = []

  return {
    record({ at, direction, message, note }) {
      const entry = {
        at,
        direction,
        message: redactPayload(message, { homeDir }),
      }
      if (note !== undefined) entry.note = redactPayload(note, { homeDir })
      entries.push(entry)
      return entry
    },
    get length() {
      return entries.length
    },
    entries() {
      return entries.slice()
    },
  }
}
