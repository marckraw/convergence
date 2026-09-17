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

export const CURSOR_ACP_RECORDED_TOOL_CALL_PENDING = {
  sessionUpdate: 'tool_call',
  toolCallId: 'call-recorded-example',
  title: 'Edit File',
  kind: 'edit',
  status: 'pending',
  rawInput: {},
} as const

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
