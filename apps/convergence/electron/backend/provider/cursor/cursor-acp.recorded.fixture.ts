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
 * Plan prompt did **not** produce `cursor/create_plan` or
 * `cursor/update_todos` server requests (inbound methods were only
 * `session/update`). Answer: no.
 */
export const CURSOR_ACP_RECORDED_CREATE_PLAN_SERVER_REQUEST_OBSERVED = false
export const CURSOR_ACP_RECORDED_UPDATE_TODOS_SERVER_REQUEST_OBSERVED = false

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
