import type {
  ProviderAttachmentCapability,
  ProviderConfigOption,
  ProviderInteractionCapability,
  ProviderMidRunInputCapability,
  ProviderModelOption,
  ProviderSettingsInfo,
  ProviderSkillsCapability,
  ProviderTelemetryCapability,
  SessionContextWindow,
} from '../provider.types'

type UnknownRecord = Record<string, unknown>

export const CURSOR_PROVIDER_ID = 'cursor'
export const CURSOR_PROVIDER_NAME = 'Cursor'
export const CURSOR_VENDOR_LABEL = 'Anysphere'

export const CURSOR_ACP_MODE_CONFIG_ID = 'mode'
export const CURSOR_ACP_MODEL_CONFIG_ID = 'model'
export const CURSOR_ACP_LOGIN_METHOD_ID = 'cursor_login'
export const CURSOR_DASHBOARD_URL = 'https://cursor.com/dashboard'

export const CURSOR_ACP_REQUEST_METHODS = [
  'initialize',
  'authenticate',
  'session/new',
  'session/load',
  'session/list',
  'session/prompt',
  'session/set_mode',
  'session/set_config_option',
] as const

export const CURSOR_ACP_SERVER_REQUEST_METHODS = [
  'session/request_permission',
  'cursor/ask_question',
  'cursor/create_plan',
  'cursor/update_todos',
  'cursor/task',
  'cursor/generate_image',
] as const

export const CURSOR_ACP_SESSION_UPDATES = [
  'agent_message_chunk',
  'agent_thought_chunk',
  'tool_call',
  'tool_call_update',
  'available_commands_update',
  'session_info_update',
  'current_mode_update',
  'current_model_update',
] as const

export const CURSOR_ACP_ATTACHMENT_CAPABILITY: ProviderAttachmentCapability = {
  supportsImage: true,
  supportsPdf: false,
  supportsText: true,
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 0,
  maxTextBytes: 1 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
}

export const CURSOR_ACP_MID_RUN_INPUT_CAPABILITY: ProviderMidRunInputCapability =
  {
    supportsAnswer: true,
    supportsNativeFollowUp: false,
    supportsAppQueuedFollowUp: true,
    supportsSteer: false,
    supportsInterrupt: false,
    defaultRunningMode: 'follow-up',
    notes:
      'Cursor ACP supports structured server requests and app-queued follow-up can be built on the long-lived session. Native steer/interrupt remains disabled until cancellation and concurrent prompt behavior are hardened.',
  }

export const CURSOR_ACP_SKILLS_CAPABILITY: ProviderSkillsCapability = {
  catalog: 'native-rpc',
  invocation: 'native-command',
  activationConfirmation: 'none',
}

export const CURSOR_ACP_INTERACTION_CAPABILITY: ProviderInteractionCapability =
  {
    inputRequests: ['choice', 'plan'],
    passiveUpdates: ['todos', 'task', 'generated-image'],
    unavailable: ['generated-image-artifact-rendering'],
    notes:
      'Cursor ACP ask-question and create-plan requests use shared input requests. Todo, task, and generated-image notifications are represented as transcript notes until richer shared primitives exist.',
  }

export const CURSOR_ACP_PROVIDER_DECISION = {
  supportsContinuation: true,
  modelSelection: 'acp-advertised-options-only',
  modelConfigMutation: 'session-scoped-set-config-option-only',
  modeSettingMethod: 'session/set_mode',
  approvePermissionOptionId: 'allow-once',
  denyPermissionOptionId: 'reject-once',
  stopStrategy: 'terminate-acp-process-until-session-cancel-is-supported',
  quotaTelemetry: 'unavailable-from-acp-prompt-result',
  contextWindowTelemetry: 'model-context-metadata-only-token-usage-unavailable',
} as const

export const CURSOR_ACP_TELEMETRY_CAPABILITY: ProviderTelemetryCapability = {
  contextWindow: {
    availability: 'partial',
    source: 'model-metadata',
    notes:
      'Cursor ACP model ids may advertise a context tier, but ACP prompt results do not expose per-turn token usage.',
  },
  quota: {
    availability: 'unavailable',
    source: 'manual',
    usageUrl: CURSOR_DASHBOARD_URL,
    notes: 'Cursor ACP does not expose usage or quota counters to Convergence.',
  },
}

export const CURSOR_ACP_SETTINGS_INFO: ProviderSettingsInfo = {
  help: [
    {
      label: 'Authentication',
      value:
        'Cursor authentication is provider-managed through the Cursor CLI and ACP authenticate call.',
    },
    {
      label: 'Models',
      value:
        'Convergence only shows model options advertised by Cursor ACP for the current installation.',
    },
    {
      label: 'Modes',
      value:
        'Cursor modes are provider-reported ACP session config. Default mode persistence is not separate from Cursor yet.',
    },
    {
      label: 'Usage',
      value:
        'Cursor ACP does not report quota windows, so Convergence links to Cursor dashboard usage instead of estimating limits.',
    },
  ],
  links: [{ label: 'Cursor dashboard', url: CURSOR_DASHBOARD_URL }],
}

export interface CursorAcpModelIdParts {
  raw: string
  baseId: string
  params: Record<string, string | true>
}

export interface CursorAcpSelectOption {
  id: string
  label: string
  description: string | null
}

export interface CursorAcpConfigOption {
  id: string
  label: string
  currentValue: string | null
  options: CursorAcpSelectOption[]
}

export type CursorAcpMessageKind =
  | 'response'
  | 'notification'
  | 'permission-request'
  | 'cursor-ask-question'
  | 'cursor-create-plan'
  | 'cursor-update-todos'
  | 'cursor-task'
  | 'cursor-generate-image'
  | 'assistant-message-chunk'
  | 'thinking-chunk'
  | 'tool-call'
  | 'tool-call-update'
  | 'available-commands-update'
  | 'session-info-update'
  | 'current-mode-update'
  | 'current-model-update'
  | 'unknown'

export function parseCursorAcpModelId(id: string): CursorAcpModelIdParts {
  const raw = id.trim()
  const match = raw.match(/^(.*?)\[(.*)]$/)
  if (!match) return { raw, baseId: raw, params: {} }

  const params: Record<string, string | true> = {}
  for (const segment of match[2]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const equalsIndex = segment.indexOf('=')
    if (equalsIndex === -1) {
      params[segment] = true
      continue
    }

    const key = segment.slice(0, equalsIndex).trim()
    const value = segment.slice(equalsIndex + 1).trim()
    if (key) params[key] = value || true
  }

  return {
    raw,
    baseId: match[1].trim(),
    params,
  }
}

export function normalizeCursorAcpConfigOptions(
  sessionResult: unknown,
): CursorAcpConfigOption[] {
  const configOptions = readArray(readField(sessionResult, 'configOptions'))

  return configOptions.flatMap((option): CursorAcpConfigOption[] => {
    if (!isRecord(option)) return []

    const id = readStringField(option, 'id') ?? readStringField(option, 'name')
    if (!id) return []

    return [
      {
        id,
        label:
          readStringField(option, 'label') ??
          readStringField(option, 'name') ??
          formatCursorAcpModelLabel(id),
        currentValue:
          readStringField(option, 'currentValue') ??
          readStringField(option, 'value') ??
          readStringField(option, 'current') ??
          null,
        options: normalizeCursorAcpSelectOptions(readField(option, 'options')),
      },
    ]
  })
}

export function normalizeCursorAcpSelectOptions(
  value: unknown,
): CursorAcpSelectOption[] {
  return readArray(value).flatMap((option): CursorAcpSelectOption[] => {
    if (typeof option === 'string') {
      return [
        {
          id: option,
          label: formatCursorAcpModelLabel(option),
          description: null,
        },
      ]
    }

    if (!isRecord(option)) return []

    const id =
      readStringField(option, 'id') ??
      readStringField(option, 'value') ??
      readStringField(option, 'modelId')
    if (!id) return []

    return [
      {
        id,
        label:
          readStringField(option, 'label') ??
          readStringField(option, 'name') ??
          formatCursorAcpModelLabel(id),
        description: readStringField(option, 'description'),
      },
    ]
  })
}

export function normalizeCursorAcpModelOptions(
  sessionResult: unknown,
): ProviderModelOption[] {
  const configModelOptions =
    normalizeCursorAcpConfigOptions(sessionResult).find(
      (option) => option.id === CURSOR_ACP_MODEL_CONFIG_ID,
    )?.options ?? []

  const modelContainer = readField(sessionResult, 'models')
  const fallbackModelOptions = normalizeCursorAcpSelectOptions(
    readField(modelContainer, 'availableModels'),
  )

  const seen = new Set<string>()
  const sourceOptions =
    configModelOptions.length > 0 ? configModelOptions : fallbackModelOptions

  return sourceOptions.flatMap((option): ProviderModelOption[] => {
    if (seen.has(option.id)) return []
    seen.add(option.id)
    const contextWindowTokens = parseCursorAcpContextWindowTokens(option.id)
    const description =
      option.description ?? buildCursorAcpModelDescription(option.id)

    return [
      {
        id: option.id,
        label: option.label,
        ...(description ? { description } : {}),
        ...(contextWindowTokens ? { contextWindowTokens } : {}),
        defaultEffort: null,
        effortOptions: [],
        inputModalities: ['text'],
        source: 'provider',
      },
    ]
  })
}

export function normalizeCursorAcpProviderConfigOptions(
  sessionResult: unknown,
): ProviderConfigOption[] {
  return normalizeCursorAcpConfigOptions(sessionResult).flatMap(
    (option): ProviderConfigOption[] => {
      if (
        option.id !== CURSOR_ACP_MODE_CONFIG_ID &&
        option.id !== CURSOR_ACP_MODEL_CONFIG_ID
      ) {
        return []
      }

      return [
        {
          id: option.id,
          label: option.label,
          description:
            option.id === CURSOR_ACP_MODE_CONFIG_ID
              ? 'Provider-reported Cursor session mode.'
              : 'Provider-reported Cursor model config.',
          currentValue: option.currentValue,
          options: option.options.map((entry) => ({
            id: entry.id,
            label: entry.label,
            ...(entry.description ? { description: entry.description } : {}),
          })),
          source: 'provider',
          persistence: 'session',
          method:
            option.id === CURSOR_ACP_MODE_CONFIG_ID
              ? 'session/set_mode'
              : 'session/set_config_option',
          notes:
            option.id === CURSOR_ACP_MODE_CONFIG_ID
              ? 'Convergence observes Cursor mode metadata; editable persisted mode defaults require the broader provider-config settings schema.'
              : 'Convergence applies selected models to the active Cursor ACP session instead of persisting provider-global model state.',
        },
      ]
    },
  )
}

export function getCursorAcpCurrentModelId(
  sessionResult: unknown,
): string | null {
  return (
    normalizeCursorAcpConfigOptions(sessionResult).find(
      (option) => option.id === CURSOR_ACP_MODEL_CONFIG_ID,
    )?.currentValue ??
    readStringField(readField(sessionResult, 'models'), 'currentModelId') ??
    null
  )
}

export function getCursorAcpCurrentModeId(
  sessionResult: unknown,
): string | null {
  return (
    normalizeCursorAcpConfigOptions(sessionResult).find(
      (option) => option.id === CURSOR_ACP_MODE_CONFIG_ID,
    )?.currentValue ??
    readStringField(readField(sessionResult, 'modes'), 'currentModeId') ??
    null
  )
}

export function getCursorAcpDefaultModelId(sessionResult: unknown): string {
  return (
    getCursorAcpCurrentModelId(sessionResult) ??
    normalizeCursorAcpModelOptions(sessionResult)[0]?.id ??
    'default[]'
  )
}

export function formatCursorAcpModelLabel(id: string): string {
  const parts = parseCursorAcpModelId(id)
  if (parts.raw === 'default[]' || parts.baseId === 'default') return 'Auto'

  const label = parts.baseId
    .split('-')
    .filter(Boolean)
    .map(formatModelToken)
    .join(' ')

  const details = [
    parts.params.thinking === 'true' ? 'thinking' : null,
    typeof parts.params.context === 'string' ? parts.params.context : null,
    typeof parts.params.effort === 'string'
      ? `${parts.params.effort} effort`
      : null,
    parts.params.fast === 'true'
      ? 'fast'
      : parts.params.fast === 'false'
        ? 'standard'
        : null,
  ].filter((value): value is string => Boolean(value))

  return details.length > 0 ? `${label} (${details.join(', ')})` : label
}

export function parseCursorAcpContextWindowTokens(
  modelId: string | null | undefined,
): number | null {
  if (!modelId) return null
  const context = parseCursorAcpModelId(modelId).params.context
  if (typeof context !== 'string') return null

  const match = context
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)([km])?$/)
  if (!match) return null

  const numeric = Number(match[1])
  if (!Number.isFinite(numeric) || numeric <= 0) return null

  const multiplier = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1
  return Math.round(numeric * multiplier)
}

export function buildCursorUnavailableContextWindow(
  modelId: string | null | undefined,
): SessionContextWindow {
  const contextWindowTokens = parseCursorAcpContextWindowTokens(modelId)
  if (contextWindowTokens) {
    return {
      availability: 'unavailable',
      source: 'estimated',
      reason: `Cursor ACP reports a ${formatFullTokens(contextWindowTokens)} token context tier for the selected model, but does not expose per-turn token usage to Convergence.`,
    }
  }

  return {
    availability: 'unavailable',
    source: 'provider',
    reason:
      'Cursor ACP does not expose reliable context-window usage to Convergence for this session.',
  }
}

export function classifyCursorAcpMessage(value: unknown): CursorAcpMessageKind {
  if (!isRecord(value)) return 'unknown'

  if (isResponseMessage(value)) return 'response'

  const method = readStringField(value, 'method')
  if (!method) return 'unknown'

  switch (method) {
    case 'session/request_permission':
      return 'permission-request'
    case 'cursor/ask_question':
      return 'cursor-ask-question'
    case 'cursor/create_plan':
      return 'cursor-create-plan'
    case 'cursor/update_todos':
      return 'cursor-update-todos'
    case 'cursor/task':
      return 'cursor-task'
    case 'cursor/generate_image':
      return 'cursor-generate-image'
    case 'session/update':
      return classifyCursorAcpSessionUpdate(readField(value, 'params'))
    default:
      return 'notification'
  }
}

export function classifyCursorAcpSessionUpdate(
  params: unknown,
): CursorAcpMessageKind {
  const update =
    readField(params, 'update') ?? readField(params, 'sessionUpdate') ?? params

  const sessionUpdate =
    typeof update === 'string'
      ? update
      : readStringField(update, 'sessionUpdate')

  switch (sessionUpdate) {
    case 'agent_message_chunk':
      return 'assistant-message-chunk'
    case 'agent_thought_chunk':
      return 'thinking-chunk'
    case 'tool_call':
      return 'tool-call'
    case 'tool_call_update':
      return 'tool-call-update'
    case 'available_commands_update':
      return 'available-commands-update'
    case 'session_info_update':
      return 'session-info-update'
    case 'current_mode_update':
      return 'current-mode-update'
    case 'current_model_update':
      return 'current-model-update'
    default:
      return 'unknown'
  }
}

export function mapCursorApprovalToAcpOptionId(approved: boolean): string {
  return approved
    ? CURSOR_ACP_PROVIDER_DECISION.approvePermissionOptionId
    : CURSOR_ACP_PROVIDER_DECISION.denyPermissionOptionId
}

export interface CursorAcpRedactionOptions {
  maxStringLength?: number
  maxArrayItems?: number
  maxDepth?: number
}

export function redactCursorAcpPayload(
  value: unknown,
  options: CursorAcpRedactionOptions = {},
): unknown {
  return redactValue(value, {
    maxStringLength: options.maxStringLength ?? 240,
    maxArrayItems: options.maxArrayItems ?? 20,
    maxDepth: options.maxDepth ?? 8,
  })
}

function redactValue(
  value: unknown,
  options: Required<CursorAcpRedactionOptions>,
  key: string | null = null,
  depth = 0,
): unknown {
  if (key && isSensitiveKey(key)) return '[redacted]'
  if (key && isRawToolPayloadKey(key))
    return summarizeRawPayload(value, options)
  if (key && isAvailableCommandsKey(key))
    return summarizeAvailableCommands(value, options)
  if (key && isPromptPayloadKey(key))
    return summarizePromptPayload(value, options)

  if (typeof value === 'string') return truncateString(value, options)
  if (typeof value !== 'object' || value === null) return value
  if (depth >= options.maxDepth) return '[truncated object]'

  if (Array.isArray(value)) {
    const items = value
      .slice(0, options.maxArrayItems)
      .map((item) => redactValue(item, options, key, depth + 1))

    if (value.length > options.maxArrayItems) {
      items.push(`[truncated ${value.length - options.maxArrayItems} items]`)
    }

    return items
  }

  const output: UnknownRecord = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    output[entryKey] = redactValue(entryValue, options, entryKey, depth + 1)
  }

  return output
}

function summarizePromptPayload(
  value: unknown,
  options: Required<CursorAcpRedactionOptions>,
): unknown {
  if (typeof value === 'string') {
    return {
      type: 'text',
      textBytes: Buffer.byteLength(value),
    }
  }

  if (Array.isArray(value)) {
    const parts = value
      .slice(0, options.maxArrayItems)
      .map((item) => summarizePromptPart(item, options))

    if (value.length > options.maxArrayItems) {
      parts.push(`[truncated ${value.length - options.maxArrayItems} parts]`)
    }

    return {
      count: value.length,
      parts,
    }
  }

  if (isRecord(value)) return summarizePromptPart(value, options)

  return '[redacted prompt]'
}

function summarizePromptPart(
  value: unknown,
  options: Required<CursorAcpRedactionOptions>,
): unknown {
  if (typeof value === 'string') {
    return {
      type: 'text',
      textBytes: Buffer.byteLength(value),
    }
  }

  if (!isRecord(value)) return '[prompt part]'

  const summary: UnknownRecord = {}
  const type = readStringField(value, 'type') ?? readStringField(value, 'kind')
  if (type) summary.type = type

  const mimeType = readStringField(value, 'mimeType')
  if (mimeType) summary.mimeType = truncateString(mimeType, options)

  const text = readField(value, 'text')
  if (typeof text === 'string') {
    summary.textBytes = Buffer.byteLength(text)
  }

  const data = readField(value, 'data')
  if (typeof data === 'string') {
    summary.dataBytes = Buffer.byteLength(data)
  }

  return Object.keys(summary).length > 0 ? summary : '[prompt part]'
}

function summarizeAvailableCommands(
  value: unknown,
  options: Required<CursorAcpRedactionOptions>,
): unknown {
  if (!Array.isArray(value)) return redactValue(value, options, null, 1)

  const commands = value.slice(0, options.maxArrayItems).map((item) => {
    if (!isRecord(item)) return redactValue(item, options, null, 1)

    const summary: UnknownRecord = {}
    for (const key of ['name', 'description', 'scope', 'source', 'kind']) {
      const field = readField(item, key)
      if (field !== undefined) {
        summary[key] = redactValue(field, options, key, 1)
      }
    }
    const input = readField(item, 'input')
    if (isRecord(input)) {
      const hint = readStringField(input, 'hint')
      summary.input = hint ? { hint: truncateString(hint, options) } : true
    }
    return Object.keys(summary).length > 0 ? summary : '[command]'
  })

  return {
    count: value.length,
    commands: [
      ...commands,
      ...(value.length > options.maxArrayItems
        ? [`[truncated ${value.length - options.maxArrayItems} commands]`]
        : []),
    ],
  }
}

function summarizeRawPayload(
  value: unknown,
  options: Required<CursorAcpRedactionOptions>,
): unknown {
  if (typeof value === 'string') return truncateString(value, options)
  if (!isRecord(value)) return redactValue(value, options, null, 1)

  const summary: UnknownRecord = {}
  for (const key of ['type', 'kind', 'title', 'status', 'command']) {
    const field = readField(value, key)
    if (field !== undefined) {
      summary[key] = redactValue(field, options, key, 1)
    }
  }

  const content = readField(value, 'content')
  if (typeof content === 'string') {
    summary.contentPreview = truncateString(content, options)
    summary.contentBytes = Buffer.byteLength(content)
  } else if (content !== undefined) {
    summary.content = redactValue(content, options, 'content', 1)
  }

  if (Object.keys(summary).length === 0) {
    return '[redacted raw tool payload]'
  }

  return summary
}

function truncateString(
  value: string,
  options: Required<CursorAcpRedactionOptions>,
): string {
  if (value.length <= options.maxStringLength) return value
  return `${value.slice(0, options.maxStringLength)}... [truncated ${
    value.length - options.maxStringLength
  } chars]`
}

function formatModelToken(token: string): string {
  const upper = token.toUpperCase()
  if (['GPT', 'UI', 'CLI'].includes(upper)) return upper
  if (/^\d/.test(token)) return token
  return token.slice(0, 1).toUpperCase() + token.slice(1)
}

function buildCursorAcpModelDescription(id: string): string | null {
  const parts = parseCursorAcpModelId(id)
  const details = [
    parts.params.thinking === 'true' ? 'thinking' : null,
    typeof parts.params.effort === 'string'
      ? `${parts.params.effort} effort`
      : null,
    typeof parts.params.reasoning === 'string'
      ? `${parts.params.reasoning} reasoning`
      : null,
    parts.params.fast === 'true'
      ? 'fast'
      : parts.params.fast === 'false'
        ? 'standard'
        : null,
  ].filter((value): value is string => Boolean(value))

  return details.length > 0 ? details.join(' · ') : null
}

function formatFullTokens(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function isResponseMessage(value: UnknownRecord): boolean {
  return (
    'id' in value &&
    !('method' in value) &&
    ('result' in value || 'error' in value)
  )
}

function isSensitiveKey(key: string): boolean {
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

function isRawToolPayloadKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return normalized === 'rawoutput' || normalized === 'rawinput'
}

function isAvailableCommandsKey(key: string): boolean {
  return key.toLowerCase() === 'availablecommands'
}

function isPromptPayloadKey(key: string): boolean {
  return key.toLowerCase() === 'prompt'
}

function readField(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function readStringField(value: unknown, key: string): string | null {
  const field = readField(value, key)
  return typeof field === 'string' && field.trim() ? field.trim() : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
