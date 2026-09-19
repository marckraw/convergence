/**
 * Scrubbed shapes recorded from a live `cursor-agent acp` probe (MAR-3141 / CP0).
 * Source: 2026-09-17 · CLI 2026.06.03-0bbb28e · see docs/architecture/cursor-acp-surface.md.
 * Only shapes that appeared on the wire are exported — not aspirational.
 */

export const CURSOR_ACP_RECORDED_CLI_VERSION = '2026.06.03-0bbb28e' as const

export const CURSOR_ACP_RECORDED_INITIALIZE_RESULT = {
  protocolVersion: 1,
  agentCapabilities: {
    loadSession: true,
    mcpCapabilities: {
      http: true,
      sse: true,
    },
    promptCapabilities: {
      audio: false,
      embeddedContext: false,
      image: true,
    },
    sessionCapabilities: {
      list: {},
    },
  },
  authMethods: [
    {
      id: 'cursor_login',
      name: 'Cursor Login',
      description:
        "Authenticate using existing Cursor login credentials. Run 'agent login' first if not logged in.",
    },
  ],
} as const

/** Logged-in `authenticate` with methodId `cursor_login` returned an empty object. */
export const CURSOR_ACP_RECORDED_AUTHENTICATE_RESULT = {} as const

/**
 * `session/cancel` as a JSON-RPC **request** is rejected on this CLI build.
 * Cancel as a **notification** (no id) ends the in-flight prompt with
 * `stopReason: "cancelled"`.
 */
export const CURSOR_ACP_RECORDED_CANCEL_REQUEST_ERROR = {
  code: -32601,
  message: '"Method not found": session/cancel',
  data: { method: 'session/cancel' },
} as const

/**
 * Outbound cancel that worked: a JSON-RPC **notification** (no `id`).
 * Session id scrubbed to a placeholder; envelope otherwise verbatim.
 */
export const CURSOR_ACP_RECORDED_CANCEL_NOTIFICATION = {
  jsonrpc: '2.0',
  method: 'session/cancel',
  params: { sessionId: 'recorded-session-id' },
} as const

export const CURSOR_ACP_RECORDED_CANCELLED_PROMPT_RESULT = {
  stopReason: 'cancelled',
} as const

export const CURSOR_ACP_RECORDED_END_TURN_PROMPT_RESULT = {
  stopReason: 'end_turn',
} as const

export const CURSOR_ACP_RECORDED_SESSION_INFO_UPDATE = {
  sessionUpdate: 'session_info_update',
  title: 'Slow Counter',
} as const

/**
 * Modes/models were observed on `session/new` and `session/load` results,
 * not as `current_mode_update` / `current_model_update` sessionUpdate kinds
 * in this probe.
 */
export const CURSOR_ACP_RECORDED_SESSION_MODES = {
  currentModeId: 'agent',
  availableModes: [
    {
      id: 'agent',
      name: 'Agent',
      description: 'Full agent capabilities with tool access',
    },
    {
      id: 'plan',
      name: 'Plan',
      description:
        'Read-only mode for planning and designing before implementation',
    },
    {
      id: 'ask',
      name: 'Ask',
      description: 'Q&A mode - no edits or command execution',
    },
  ],
} as const

/**
 * Models from `session/new` / `session/load` results (not `current_model_update`).
 * Wire fields are `modelId` + `name` (not `id`).
 */
export const CURSOR_ACP_RECORDED_SESSION_MODELS = {
  currentModelId: 'grok-4.6[effort=high,fast=true]',
  availableModels: [
    { modelId: 'default[]', name: 'Auto' },
    { modelId: 'grok-4.6[effort=high,fast=true]', name: 'grok-4.6' },
    { modelId: 'composer-2.5[fast=true]', name: 'composer-2.5' },
    {
      modelId:
        'claude-opus-5[thinking=true,context=300k,effort=high,fast=false]',
      name: 'claude-opus-5',
    },
    {
      modelId:
        'claude-opus-4-8[thinking=true,context=300k,effort=high,fast=false]',
      name: 'claude-opus-4-8',
    },
    {
      modelId: 'gpt-5.6-sol[context=272k,reasoning=medium,fast=false]',
      name: 'gpt-5.6-sol',
    },
    {
      modelId: 'gpt-5.5[context=272k,reasoning=medium,fast=false]',
      name: 'gpt-5.5',
    },
    {
      modelId: 'claude-fable-5-1[thinking=true,context=300k,effort=high]',
      name: 'claude-fable-5-1',
    },
    {
      modelId: 'claude-fable-5[thinking=true,context=300k,effort=high]',
      name: 'claude-fable-5',
    },
    { modelId: 'grok-4.5[effort=high,fast=true]', name: 'grok-4.5' },
    {
      modelId: 'gemini-3.8-flash[reasoning_effort=high]',
      name: 'gemini-3.8-flash',
    },
    { modelId: 'gemini-3.7-flash[effort=high]', name: 'gemini-3.7-flash' },
    {
      modelId: 'muse-spark-1.3[context=300k,effort=high]',
      name: 'muse-spark-1.3',
    },
    {
      modelId: 'gpt-5.6-terra[context=272k,reasoning=medium,fast=false]',
      name: 'gpt-5.6-terra',
    },
    {
      modelId: 'claude-sonnet-5[thinking=true,context=300k,effort=high]',
      name: 'claude-sonnet-5',
    },
    {
      modelId: 'claude-sonnet-4-6[thinking=true,context=200k,effort=medium]',
      name: 'claude-sonnet-4-6',
    },
    {
      modelId: 'gpt-5.3-codex[reasoning=medium,fast=false]',
      name: 'gpt-5.3-codex',
    },
    {
      modelId:
        'claude-opus-4-7[thinking=true,context=300k,effort=xhigh,fast=false]',
      name: 'claude-opus-4-7',
    },
    {
      modelId: 'gpt-5.4[context=272k,reasoning=medium,fast=false]',
      name: 'gpt-5.4',
    },
    {
      modelId: 'claude-opus-4-6[thinking=true,context=200k,effort=high]',
      name: 'claude-opus-4-6',
    },
    { modelId: 'claude-opus-4-5[thinking=true]', name: 'claude-opus-4-5' },
    { modelId: 'gpt-5.2[reasoning=medium,fast=false]', name: 'gpt-5.2' },
    {
      modelId: 'gpt-5.6-luna[context=272k,reasoning=medium,fast=false]',
      name: 'gpt-5.6-luna',
    },
    { modelId: 'gemini-3.6-flash[effort=high]', name: 'gemini-3.6-flash' },
    { modelId: 'gemini-3.1-pro[]', name: 'gemini-3.1-pro' },
    { modelId: 'gpt-5.4-mini[reasoning=medium]', name: 'gpt-5.4-mini' },
    { modelId: 'gpt-5.4-nano[reasoning=medium]', name: 'gpt-5.4-nano' },
    { modelId: 'claude-haiku-4-5[thinking=true]', name: 'claude-haiku-4-5' },
    {
      modelId: 'claude-sonnet-4-5[thinking=true,context=200k]',
      name: 'claude-sonnet-4-5',
    },
    { modelId: 'gpt-5.1[reasoning=medium]', name: 'gpt-5.1' },
    { modelId: 'gemini-3-flash[]', name: 'gemini-3-flash' },
    { modelId: 'gemini-3.5-flash[]', name: 'gemini-3.5-flash' },
    {
      modelId: 'claude-sonnet-4[thinking=false,context=200k]',
      name: 'claude-sonnet-4',
    },
    { modelId: 'gpt-5-mini[]', name: 'gpt-5-mini' },
    { modelId: 'gemini-2.5-flash[]', name: 'gemini-2.5-flash' },
    { modelId: 'kimi-k3[reasoning=max]', name: 'kimi-k3' },
    { modelId: 'kimi-k2.7-code[]', name: 'kimi-k2.7-code' },
    { modelId: 'glm-5.2[reasoning=high]', name: 'glm-5.2' },
  ],
} as const

export const CURSOR_ACP_RECORDED_SESSION_UPDATE_KINDS = [
  'agent_message_chunk',
  'agent_thought_chunk',
  'available_commands_update',
  'session_info_update',
  'tool_call',
  'tool_call_update',
  'user_message_chunk',
] as const

export const CURSOR_ACP_RECORDED_AGENT_MESSAGE_CHUNK = {
  sessionUpdate: 'agent_message_chunk',
  content: { type: 'text', text: 'ok' },
} as const

export const CURSOR_ACP_RECORDED_AGENT_THOUGHT_CHUNK = {
  sessionUpdate: 'agent_thought_chunk',
  content: { type: 'text', text: 'Counting from 1 to 40,' },
} as const

export const CURSOR_ACP_RECORDED_USER_MESSAGE_CHUNK = {
  sessionUpdate: 'user_message_chunk',
  content: { type: 'text', text: 'reply with exactly: ok' },
} as const

/**
 * Pending edit `tool_call`. `rawInput: {}` is the **wire** value on the first
 * pending event (not a scrubber invention); later updates carried a path.
 */
export const CURSOR_ACP_RECORDED_TOOL_CALL_PENDING = {
  sessionUpdate: 'tool_call',
  toolCallId: 'call-recorded-example',
  title: 'Edit File',
  kind: 'edit',
  status: 'pending',
  rawInput: {},
} as const

/**
 * Completed `tool_call_update` with a `diff` content block. `oldText` /
 * `newText` include unified-diff header lines **as sent on the wire** (raw
 * transcript line confirmed; not scrubber artifacts). Path tilde-normalized
 * to `/tmp/probe-repo/…` for the fixture.
 */
export const CURSOR_ACP_RECORDED_TOOL_CALL_DIFF_UPDATE = {
  sessionUpdate: 'tool_call_update',
  toolCallId: 'call-recorded-example',
  status: 'completed',
  content: [
    {
      type: 'diff',
      path: '/tmp/probe-repo/note.txt',
      oldText: '-- /dev/null',
      newText: '++ b//tmp/probe-repo/note.txt\nping',
    },
  ],
} as const

/** Top-level `plan` sessionUpdate was not observed in the CP0 probe. */
export const CURSOR_ACP_RECORDED_PLAN_SESSION_UPDATE_OBSERVED = false

/**
 * CP0's **plan** prompt produced no `cursor/create_plan` and no
 * `cursor/update_todos` server request (inbound methods were only
 * `session/update`). The stimulus is part of the fact: MAR-3239's probe 2
 * asked for a todo list and a delegated subagent task instead, and both
 * `cursor/update_todos` and `cursor/task` arrived (see the probe-2 block
 * below). Do not read these two as "the method does not exist".
 */
export const CURSOR_ACP_CP0_CREATE_PLAN_ON_PLAN_PROMPT_OBSERVED = false
export const CURSOR_ACP_CP0_UPDATE_TODOS_ON_PLAN_PROMPT_OBSERVED = false

/**
 * No token usage, cost, or context-window figures appeared on session updates
 * or `session/prompt` results in the CP0 transcript.
 */
export const CURSOR_ACP_RECORDED_USAGE_ON_WIRE = false

export const CURSOR_ACP_RECORDED_PROBE_META = {
  promptsSent: 7,
  cancelWorksAsNotification: true,
  cancelWorksAsRequest: false,
  longLivedProcessHoldsAcrossIdle: true,
  secondSessionNewOnSameProcess: true,
  sessionLoadOnFreshProcess: true,
  configHomeRelocateFlagDocumentedInHelp: false,
} as const

// ---------------------------------------------------------------------------
// Probe 2 (MAR-3239) · 2026-09-20 · CLI 2026.06.03-0bbb28e · default model
// Seven one-line prompts across two processes, plus a zero-prompt catalog read.
// Session ids and tool-call ids scrubbed to placeholders; every other field is
// verbatim from the wire.
// ---------------------------------------------------------------------------

/**
 * `session/request_permission` params for a shell command outside the CLI's
 * allowlist. Identical `options` on all 7 permission requests of probe 2.
 * The wire `toolCallId` is a long opaque string; the probe's scrubber redacts
 * it, so a placeholder stands here.
 */
export const CURSOR_ACP_RECORDED_PERMISSION_REQUEST_PARAMS = {
  sessionId: 'recorded-session-id',
  toolCall: {
    toolCallId: 'call-recorded-example',
    title: '`sleep 1 && echo a && sleep 1 && echo b`',
    kind: 'execute',
    status: 'pending',
    content: [
      {
        type: 'content',
        content: {
          type: 'text',
          text: 'Not in allowlist: sleep 1, echo a, sleep 1, echo b',
        },
      },
    ],
  },
  options: [
    { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
  ],
} as const

/**
 * The three option ids offered, in wire order. **There is an allow-always** —
 * MAR-3146 ("always allow") has a real option id to send, it does not need to
 * be simulated client-side.
 */
export const CURSOR_ACP_RECORDED_PERMISSION_OPTION_IDS = [
  'allow-once',
  'allow-always',
  'reject-once',
] as const

/** The outcome the probe sent back for every request (auto-approve). */
export const CURSOR_ACP_RECORDED_PERMISSION_RESPONSE_RESULT = {
  outcome: { outcome: 'selected', optionId: 'allow-once' },
} as const

/**
 * `cursor/update_todos` arrives as a JSON-RPC **server request** (it carries an
 * `id`), not a notification, and not a `session/update`.
 *
 * `merge` is load-bearing: the first call of a turn carried `merge: false` and
 * the **complete** list; later calls carried `merge: true` and **only the
 * changed todos**. Rendering a `merge: true` payload as the whole list would
 * silently drop every unchanged item.
 */
export const CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST = {
  toolCallId: 'call-recorded-example',
  todos: [
    {
      id: '1',
      content: 'Inspect repo purpose/structure for README content',
      status: 'in_progress',
    },
    { id: '2', content: 'Draft README.md via subagent', status: 'pending' },
    {
      id: '3',
      content: 'Review README and mark todos done',
      status: 'pending',
    },
  ],
  merge: false,
} as const

/** A later delta on the same turn: only the two todos that changed. */
export const CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST = {
  toolCallId: 'call-recorded-example',
  todos: [
    {
      id: '1',
      content: 'Inspect repo purpose/structure for README content',
      status: 'completed',
    },
    {
      id: '2',
      content: 'Draft README.md via subagent',
      status: 'in_progress',
    },
  ],
  merge: true,
} as const

export const CURSOR_ACP_RECORDED_TODO_STATUSES = [
  'pending',
  'in_progress',
  'completed',
] as const

/**
 * `cursor/task` — also a **server request**. It arrived once, *after* the
 * delegated subagent had finished (it carries `durationMs`), so it is a
 * completion record rather than a start event. `prompt` holds the full
 * subagent instruction and is the field most likely to carry workspace
 * content: treat it as sensitive.
 */
export const CURSOR_ACP_RECORDED_TASK_REQUEST = {
  toolCallId: 'call-recorded-example',
  description: 'Write repo README',
  prompt: 'Write a short README.md for the git repo at /tmp/probe-repo…',
  subagentType: { custom: { unspecified: {} } },
  model: 'default',
  agentId: 'recorded-agent-id',
  durationMs: 15976,
} as const

/**
 * The probe answered every `cursor/update_todos` and `cursor/task` with
 * `-32601 Method not found` and the turn still completed `end_turn`: the CLI
 * does not require a client to implement them.
 */
export const CURSOR_ACP_RECORDED_CURSOR_EXT_METHODS_ARE_OPTIONAL = true

/**
 * `/compress` is **not** a server-side command on this build. The full
 * `available_commands_update` catalog (86 entries, read with zero prompts)
 * contains no `compress`, `compact`, `summar*` or `context*` entry. Sent as a
 * `session/prompt` it round-trips as ordinary user text: the model answered
 * with a prose "Conversation summary" and the turn ended `end_turn`. No
 * protocol-level compaction signal of any kind appeared.
 */
export const CURSOR_ACP_RECORDED_COMPRESS_IN_COMMAND_CATALOG = false
export const CURSOR_ACP_RECORDED_COMPRESS_PROMPT_RESULT = {
  stopReason: 'end_turn',
} as const
export const CURSOR_ACP_RECORDED_AVAILABLE_COMMANDS_COUNT = 86

/**
 * Command-catalog entry shape. Only built-in names are recorded here — the
 * live catalog also lists the operator's personal skills, which do not belong
 * in this repo.
 */
export const CURSOR_ACP_RECORDED_AVAILABLE_COMMAND_SAMPLE = {
  name: 'copy-request-id',
  description: 'Copy the last request ID to clipboard',
} as const

/**
 * `cursor-agent status` while logged in. Exit code 0, empty stderr, a single
 * stdout line of 35 bytes. The account identifier is NOT recorded — only the
 * shape. Logged-out behaviour stays **unknown**: nobody logs this machine out.
 */
export const CURSOR_ACP_RECORDED_STATUS_SHAPE = {
  exitCode: 0,
  stdoutBytes: 35,
  stderrBytes: 0,
  stdoutTemplate: '✓ Logged in as <account-email>\n',
} as const

/** Update kinds seen in probe 2. `user_message_chunk` did NOT recur. */
export const CURSOR_ACP_PROBE_2_SESSION_UPDATE_KINDS = [
  'agent_message_chunk',
  'agent_thought_chunk',
  'available_commands_update',
  'session_info_update',
  'tool_call',
  'tool_call_update',
] as const

/** Still not observed in probe 2: a top-level `plan` sessionUpdate. */
export const CURSOR_ACP_PROBE_2_PLAN_SESSION_UPDATE_OBSERVED = false

export const CURSOR_ACP_PROBE_2_META = {
  promptsSent: 7,
  promptCeiling: 8,
  /** Q1: the `WritableIterable is closed` death did not recur in 3 attempts. */
  dyingTurnReproducedInThreeAttempts: false,
  dyingTurnAttempts: 3,
  /** Every one of the 7 turns ended `end_turn` with the process still alive. */
  allTurnsEndedEndTurn: true,
  processAliveAfterEveryTurn: true,
  stderrBytesAcrossProbe: 0,
  permissionRequestsAnswered: 7,
  allowAlwaysOffered: true,
  updateTodosObserved: true,
  cursorTaskObserved: true,
} as const
