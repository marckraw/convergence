import { CONVERSATION_RESET_COMMAND } from '../../../../src/shared/lib/conversation-reset.pure'
import {
  CONTEXT_RESTARTED_NOTE_TEXT,
  SESSION_RESTARTED_EVENT_TYPE,
} from '../session-restart.pure'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import type { SessionDelta } from '../../session/conversation-item.types'
import type {
  InteractionChoiceOption,
  InteractionFormField,
  InteractionQuestion,
  InteractionRequest,
  InteractionResponse,
} from '../../session/conversation-item.types'
import type {
  Provider,
  SessionStartConfig,
  SessionHandle,
  SessionStatus,
  AttentionState,
  SessionContextWindow,
  Attachment,
  ActivitySignal,
  MidRunInputMode,
  OneShotInput,
  OneShotResult,
  ProviderContextManagementInput,
  ProviderContextManagementResult,
} from '../provider.types'
import { JsonRpcClient, type JsonRpcId } from './jsonrpc'
import type {
  CodexServerConnection,
  CodexServerHost,
  CodexServerHostRegistry,
} from './codex-server-host'
import {
  isCodexThreadUnmaterializedError,
  readCodexUnsubscribeStatus,
  readLandedTurn,
  threadContainsClientMessage,
  type CodexLandedTurn,
} from './codex-server-host.pure'
import { runCodexOneShotOnServer } from './codex-one-shot'
import {
  CODEX_ONE_SHOT_ACCOUNT_REQUIRED,
  statesProviderAccount,
} from './codex-one-shot.pure'
import type { CodexAccountEnvTarget } from '../../provider-account/provider-account-codex-env.pure'
import { ProviderSessionEmitter } from '../provider-session.emitter'
import {
  buildFallbackCodexDescriptor,
  normalizeProviderDescriptor,
} from '../provider-descriptor.pure'
import type {
  ProviderDescriptor,
  ProviderEffortOption,
  ProviderModelOption,
  ReasoningEffort,
} from '../provider.types'
import {
  createUnavailableContextWindow,
  deriveCodexContextWindow,
} from '../context-window.pure'
import {
  buildCodexErrorNote,
  buildCodexThreadRecoveryEntry,
  buildTurnFailureEntry,
  classifyCodexErrorNotification,
  isCodexThreadNotFoundError,
  readCodexErrorNotificationMessage,
  readCodexErrorWillRetry,
} from './codex-errors.pure'
import {
  buildCodexUserInput,
  partFromAttachment,
  type CodexMessagePart,
  type CodexUserInput,
} from './codex-message.pure'
import { mapCodexSkillCatalog } from '../../skills/codex-skills.mapper.pure'
import {
  failedCodexSkillInvocation,
  markSkillSelectionsStatus,
  resolveCodexSkillInvocation,
} from '../../skills/codex-skill-invocation.pure'
import type {
  CodexSkillInput,
  CodexSkillInvocationResolution,
} from '../../skills/codex-skill-invocation.pure'
import type { SkillSelection } from '../../skills/skills.types'
import {
  initialCodexActivityState,
  reduceCodexActivity,
  type CodexActivityState,
} from './codex-activity.pure'
import type { TaskProgressService } from '../../task-progress/task-progress.service'
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import { resolveCodexPermissionConfig } from '../session-permissions.pure'
import type {
  ProviderDebugChannel,
  ProviderDebugEntry,
} from '../../provider-debug/provider-debug.types'

/**
 * How long a lost connection waits before it mourns.
 *
 * A dying server closes its sockets and exits, and those two events race. The
 * process's own exit carries its stderr — the line that says *why*, and the
 * only one worth reading (MAR-2317) — so the socket's generic report pauses
 * briefly to let the obituary win. When the socket alone failed, no obituary
 * comes and this is all the delay it costs.
 */
const CODEX_OBITUARY_GRACE_MS = 150

async function loadCodexParts(
  attachments: Attachment[] | undefined,
): Promise<CodexMessagePart[]> {
  if (!attachments || attachments.length === 0) return []
  const parts: CodexMessagePart[] = []
  for (const att of attachments) {
    if (att.kind === 'text') {
      const buf = await fs.readFile(att.storagePath)
      parts.push(
        partFromAttachment(
          att,
          new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
        ),
      )
    } else {
      parts.push(partFromAttachment(att))
    }
  }
  return parts
}

function now(): string {
  return new Date().toISOString()
}

function isContextCompactionItemType(itemType: string | null): boolean {
  return (
    itemType === 'contextCompaction' ||
    itemType === 'compacted' ||
    itemType === 'context_compacted'
  )
}

function isReasoningItemType(itemType: string | null): boolean {
  return itemType === 'reasoning' || itemType === 'agentReasoning'
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readProviderItemId(
  params: Record<string, unknown>,
  item?: Record<string, unknown> | null,
): string | null {
  return (
    readString(params.itemId) ??
    readString(params.item_id) ??
    readString(item?.id) ??
    null
  )
}

function readReasoningDelta(params: Record<string, unknown>): string | null {
  const part =
    typeof params.part === 'object' && params.part !== null
      ? (params.part as Record<string, unknown>)
      : null

  return (
    readString(params.delta) ??
    readString(params.textDelta) ??
    readString(params.summaryTextDelta) ??
    readString(params.text) ??
    readString(part?.text) ??
    null
  )
}

interface PendingApprovalRequest {
  description: string
  approveResult: unknown
  denyResult: unknown
}

interface PendingUserInputQuestion {
  id: string
  requestQuestionId: string
}

interface PendingUserInputRequest {
  kind: 'questions'
  questions: PendingUserInputQuestion[]
}

interface PendingMcpElicitationRequest {
  kind: 'mcp-elicitation'
  _meta: unknown
}

type PendingInputRequest =
  | PendingUserInputRequest
  | PendingMcpElicitationRequest

function findPendingApproval(
  pendingApprovals: Map<JsonRpcId, PendingApprovalRequest>,
  providerApprovalId: string | undefined,
): [JsonRpcId, PendingApprovalRequest] | undefined {
  if (providerApprovalId) {
    for (const entry of pendingApprovals.entries()) {
      if (String(entry[0]) === providerApprovalId) {
        return entry
      }
    }
    return undefined
  }

  return pendingApprovals.entries().next().value as
    | [JsonRpcId, PendingApprovalRequest]
    | undefined
}

function buildApprovalDescription(parts: Array<string | null>): string {
  return parts
    .map((part) => part?.trim() ?? null)
    .filter((part): part is string => !!part)
    .join('\n\n')
}

function stringFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeCodexUserInputOption(
  value: unknown,
): InteractionChoiceOption | null {
  if (!value || typeof value !== 'object') return null
  const record = value as {
    label?: unknown
    value?: unknown
    description?: unknown
    preview?: unknown
  }
  const label =
    stringFromUnknown(record.label) ?? stringFromUnknown(record.value)
  if (!label) return null

  return {
    label,
    description: stringFromUnknown(record.description) ?? undefined,
    preview: stringFromUnknown(record.preview) ?? undefined,
  }
}

function normalizeCodexUserInputQuestion(value: unknown): {
  pending: PendingUserInputQuestion
  question: InteractionQuestion
} | null {
  if (!value || typeof value !== 'object') return null
  const record = value as {
    id?: unknown
    question?: unknown
    prompt?: unknown
    header?: unknown
    options?: unknown
    multiSelect?: unknown
  }
  const text =
    stringFromUnknown(record.question) ??
    stringFromUnknown(record.prompt) ??
    stringFromUnknown(record.header)
  if (!text) return null

  const providerQuestionId =
    stringFromUnknown(record.id) ?? stringFromUnknown(record.question) ?? text
  const requestQuestionId = providerQuestionId
  const options = Array.isArray(record.options)
    ? record.options
        .map(normalizeCodexUserInputOption)
        .filter((option): option is InteractionChoiceOption => option !== null)
    : []

  return {
    pending: {
      id: providerQuestionId,
      requestQuestionId,
    },
    question: {
      id: requestQuestionId,
      question: text,
      header: stringFromUnknown(record.header) ?? text,
      options,
      multiSelect: record.multiSelect === true,
    },
  }
}

function buildCodexUserInputRequest(params: Record<string, unknown>): {
  prompt: string
  request: InteractionRequest
  pending: PendingUserInputRequest
} {
  const normalized = Array.isArray(params.questions)
    ? params.questions
        .map(normalizeCodexUserInputQuestion)
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : []

  const prompt =
    normalized.map((entry) => entry.question.question).join('\n') ||
    stringFromUnknown(params.prompt) ||
    stringFromUnknown(params.message) ||
    'Input needed'

  const choiceQuestions = normalized
    .map((entry) => entry.question)
    .filter((question) => question.options.length > 0)
  const request: InteractionRequest =
    normalized.length > 0 && choiceQuestions.length === normalized.length
      ? {
          kind: 'choice',
          questions: choiceQuestions,
        }
      : {
          kind: 'text',
          prompt,
        }

  return {
    prompt,
    request,
    pending: {
      kind: 'questions',
      questions: normalized.map((entry) => entry.pending),
    },
  }
}

function buildLegacyCodexAnswer(
  pending: PendingInputRequest,
  text: string,
): unknown {
  if (pending.kind === 'mcp-elicitation') {
    return {
      action: 'decline',
      content: null,
      _meta: null,
    }
  }

  return Object.fromEntries(
    pending.questions.map((question) => [question.id, { answers: [text] }]),
  )
}

function buildStructuredCodexAnswer(
  pending: PendingInputRequest,
  response: InteractionResponse,
): unknown {
  if (pending.kind === 'mcp-elicitation') {
    if (response.kind === 'form') {
      return {
        action: response.action,
        content: response.action === 'accept' ? response.values : null,
        _meta: response.action === 'accept' ? pending._meta : null,
      }
    }

    if (response.kind === 'url') {
      return {
        action: response.action,
        content: null,
        _meta: response.action === 'accept' ? pending._meta : null,
      }
    }

    return {
      action: 'decline',
      content: null,
      _meta: null,
    }
  }

  if (response.kind !== 'choice') {
    return {}
  }

  const answersByQuestionId = new Map(
    response.answers.map((answer) => [answer.questionId, answer.values]),
  )

  return Object.fromEntries(
    pending.questions.map((question) => [
      question.id,
      { answers: answersByQuestionId.get(question.requestQuestionId) ?? [] },
    ]),
  )
}

function readElicitationDefaultValue(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return undefined
  const record = schema as {
    default?: unknown
    enum?: unknown
    oneOf?: unknown
  }

  if (record.default !== undefined) {
    return record.default
  }

  if (Array.isArray(record.enum) && record.enum.length === 1) {
    return record.enum[0]
  }

  if (Array.isArray(record.oneOf) && record.oneOf.length === 1) {
    const [option] = record.oneOf
    if (
      option &&
      typeof option === 'object' &&
      'const' in option &&
      (option as { const?: unknown }).const !== undefined
    ) {
      return (option as { const?: unknown }).const
    }
  }

  return undefined
}

function normalizePrimitiveDefault(
  type: InteractionFormField['type'],
  value: unknown,
): string | number | boolean | undefined {
  if (type === 'boolean') {
    return typeof value === 'boolean' ? value : undefined
  }

  if (type === 'number') {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined
  }

  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : undefined
}

function formFieldTypeFromSchema(
  schema: unknown,
): InteractionFormField['type'] | null {
  if (!schema || typeof schema !== 'object') return 'string'
  const record = schema as { type?: unknown }
  if (record.type === 'boolean') return 'boolean'
  if (record.type === 'number' || record.type === 'integer') return 'number'
  if (record.type === 'string' || record.type === undefined) return 'string'
  return null
}

function buildMcpElicitationFormField(input: {
  key: string
  schema: unknown
  required: boolean
}): InteractionFormField | null {
  const type = formFieldTypeFromSchema(input.schema)
  if (!type) return null
  const record =
    input.schema && typeof input.schema === 'object'
      ? (input.schema as {
          title?: unknown
          description?: unknown
        })
      : {}
  const defaultValue = normalizePrimitiveDefault(
    type,
    readElicitationDefaultValue(input.schema),
  )

  return {
    id: input.key,
    label: stringFromUnknown(record.title) ?? input.key,
    description: stringFromUnknown(record.description) ?? undefined,
    type,
    required: input.required,
    defaultValue,
  }
}

function buildMcpElicitationInputRequest(params: Record<string, unknown>): {
  prompt: string
  request: InteractionRequest
  pending: PendingMcpElicitationRequest
} | null {
  const mode = typeof params.mode === 'string' ? params.mode : null
  const serverName =
    typeof params.serverName === 'string' ? params.serverName : 'MCP server'
  const message =
    typeof params.message === 'string' ? params.message : 'Input needed'
  const title = `${serverName} request`
  const schema =
    params.requestedSchema && typeof params.requestedSchema === 'object'
      ? (params.requestedSchema as {
          properties?: Record<string, unknown>
          required?: unknown
        })
      : null
  const _meta =
    params._meta && typeof params._meta === 'object' ? params._meta : null

  if (mode === 'form') {
    const requiredNames = new Set(
      Array.isArray(schema?.required)
        ? schema.required.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    )
    const normalizedFields = Object.entries(schema?.properties ?? {}).map(
      ([key, fieldSchema]) =>
        buildMcpElicitationFormField({
          key,
          schema: fieldSchema,
          required: requiredNames.has(key),
        }),
    )

    if (
      normalizedFields.length === 0 ||
      normalizedFields.some((field) => field === null)
    ) {
      return null
    }

    const fields = normalizedFields as InteractionFormField[]

    return {
      prompt: message,
      request: {
        kind: 'form',
        title,
        message,
        fields,
      },
      pending: {
        kind: 'mcp-elicitation',
        _meta,
      },
    }
  }

  const url = typeof params.url === 'string' ? params.url : null
  if ((mode === 'url' || (url && !schema)) && url) {
    return {
      prompt: message,
      request: {
        kind: 'url',
        title,
        message,
        url,
      },
      pending: {
        kind: 'mcp-elicitation',
        _meta,
      },
    }
  }

  return null
}

function shouldFailUnsupportedMcpElicitation(
  params: Record<string, unknown>,
): boolean {
  if (params.mode === 'url') return true
  if (params.mode !== 'form') return false
  const schema =
    params.requestedSchema && typeof params.requestedSchema === 'object'
      ? (params.requestedSchema as { properties?: Record<string, unknown> })
      : null
  return Object.keys(schema?.properties ?? {}).length > 0
}

function buildMcpElicitationApproval(
  params: Record<string, unknown>,
): PendingApprovalRequest {
  const serverName =
    typeof params.serverName === 'string' ? params.serverName : 'MCP server'
  const message =
    typeof params.message === 'string' ? params.message : 'Approval needed'
  const mode = typeof params.mode === 'string' ? params.mode : null
  const url = typeof params.url === 'string' ? params.url : null
  const schema =
    params.requestedSchema && typeof params.requestedSchema === 'object'
      ? (params.requestedSchema as {
          properties?: Record<string, unknown>
          required?: unknown
        })
      : null
  const propertyNames = schema?.properties ? Object.keys(schema.properties) : []
  const requiredNames = Array.isArray(schema?.required)
    ? schema.required.filter(
        (value): value is string => typeof value === 'string',
      )
    : []
  const content =
    mode === 'form'
      ? Object.fromEntries(
          Object.entries(schema?.properties ?? {}).flatMap(([key, value]) => {
            const defaultValue = readElicitationDefaultValue(value)
            return defaultValue === undefined ? [] : [[key, defaultValue]]
          }),
        )
      : null

  return {
    description: buildApprovalDescription([
      `MCP server: ${serverName}`,
      message,
      url ? `URL: ${url}` : null,
      propertyNames.length > 0
        ? `Requested fields: ${propertyNames.join(', ')}`
        : null,
      requiredNames.length > 0
        ? `Required fields: ${requiredNames.join(', ')}`
        : null,
    ]),
    approveResult: {
      action: 'accept',
      content,
      _meta:
        params._meta && typeof params._meta === 'object' ? params._meta : null,
    },
    denyResult: {
      action: 'decline',
      content: null,
      _meta: null,
    },
  }
}

function buildCodexApprovalRequest(
  method: string,
  params: Record<string, unknown>,
): PendingApprovalRequest | null {
  if (method === 'item/commandExecution/requestApproval') {
    return {
      description: buildApprovalDescription([
        typeof params.command === 'string'
          ? `Command: ${params.command}`
          : null,
        typeof params.reason === 'string' ? `Reason: ${params.reason}` : null,
        typeof params.cwd === 'string'
          ? `Working directory: ${params.cwd}`
          : null,
        typeof params.command !== 'string' ? 'Command approval needed' : null,
      ]),
      approveResult: { decision: 'accept' },
      denyResult: { decision: 'decline' },
    }
  }

  if (method === 'item/fileChange/requestApproval') {
    return {
      description: buildApprovalDescription([
        'File change approval needed',
        typeof params.reason === 'string' ? `Reason: ${params.reason}` : null,
        typeof params.grantRoot === 'string'
          ? `Grant root: ${params.grantRoot}`
          : null,
      ]),
      approveResult: { decision: 'accept' },
      denyResult: { decision: 'decline' },
    }
  }

  if (method === 'item/fileRead/requestApproval') {
    return {
      description: buildApprovalDescription([
        typeof params.path === 'string' ? `File: ${params.path}` : null,
        'File read approval needed',
      ]),
      approveResult: { decision: 'accept' },
      denyResult: { decision: 'deny' },
    }
  }

  if (method === 'item/mcpToolCall/requestApproval') {
    const server =
      typeof params.server === 'string' ? `MCP server: ${params.server}` : null
    const tool = typeof params.tool === 'string' ? `Tool: ${params.tool}` : null
    const name = typeof params.name === 'string' ? `Tool: ${params.name}` : null
    return {
      description: buildApprovalDescription([
        server,
        tool ?? name,
        typeof params.message === 'string' ? params.message : null,
        'MCP tool approval needed',
      ]),
      approveResult: { decision: 'accept' },
      denyResult: { decision: 'deny' },
    }
  }

  if (method === 'mcpServer/elicitation/request') {
    return buildMcpElicitationApproval(params)
  }

  return null
}

/**
 * Resolves a recorded account id to the `CODEX_HOME` that decides which
 * credential serves a process (ADR 0007, PA9). Injected rather than imported so
 * the provider never reaches into the database.
 *
 * Throws for an account that is missing or disabled — failing loudly beats
 * silently spending a different subscription.
 */
export type CodexAccountLookup = (
  accountId: string | null | undefined,
) => CodexAccountEnvTarget | null

const noCodexAccountLookup: CodexAccountLookup = () => null

export class CodexProvider implements Provider {
  id = 'codex'
  name = 'Codex'
  supportsContinuation = true
  private descriptorPromise: Promise<ProviderDescriptor> | null = null

  /**
   * @param serverHosts the app's resident `codex app-server` pool. Required,
   * and the provider's ONLY way to reach the binary: since naming and
   * extraction moved onto ephemeral threads (MAR-2824) the provider no longer
   * knows a binary path at all, so there is no path left that spawns anything
   * — not an app-server per turn (MAR-2823), not a `codex exec` per helper
   * call. The host also owns the `initialize` handshake, and with it the app
   * version Codex records.
   */
  constructor(
    private serverHosts: CodexServerHostRegistry,
    private taskProgress: TaskProgressService | null = null,
    private debugSink: ProviderDebugSink = noopDebugSink,
    private accountLookup: CodexAccountLookup = noCodexAccountLookup,
  ) {}

  /** The resident server for a session's account, or the ambient login. */
  private hostFor(
    providerAccountId: string | null | undefined,
  ): CodexServerHost {
    return this.serverHosts.get({
      account: this.accountLookup(providerAccountId),
    })
  }

  describe(): Promise<ProviderDescriptor> {
    if (!this.descriptorPromise) {
      this.descriptorPromise = this.fetchDescriptor().catch(() =>
        buildFallbackCodexDescriptor(),
      )
    }

    return this.descriptorPromise
  }

  /**
   * Naming and extraction, on the same resident server every session uses.
   *
   * `hostFor` is what carries R5: the account the caller named decides which
   * server — and so which `CODEX_HOME` — answers, exactly as it does for a
   * session. The refusal comes first because resolving a host is not free of
   * consequence: with no binary detected it throws a message about the CLI for
   * a call whose real fault is that nobody said whose subscription it spends,
   * and with one it registers an ambient host for a call about to be rejected.
   */
  async oneShot(input: OneShotInput): Promise<OneShotResult> {
    if (!statesProviderAccount(input)) {
      throw new Error(CODEX_ONE_SHOT_ACCOUNT_REQUIRED)
    }

    return runCodexOneShotOnServer(
      this.hostFor(input.providerAccountId),
      input,
      this.taskProgress,
    )
  }

  async manageContext(
    config: SessionStartConfig,
    input: ProviderContextManagementInput,
  ): Promise<ProviderContextManagementResult> {
    if (input.kind !== 'compact') {
      throw new Error(`Unsupported Codex context action: ${input.kind}`)
    }
    const threadId = config.continuationToken?.trim()
    if (!threadId) {
      throw new Error('Codex context compaction requires a continuation token')
    }

    const connection = await this.hostFor(config.providerAccountId).connect()
    const rpc = connection.rpc
    let resolveCompacted: (() => void) | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null
    const compacted = new Promise<void>((resolve, reject) => {
      resolveCompacted = resolve
      timeout = setTimeout(
        () => reject(new Error('Codex context compaction timed out')),
        120_000,
      )
      timeout.unref?.()
    })
    rpc.onNotification((method, params) => {
      const record =
        params && typeof params === 'object'
          ? (params as { item?: { type?: unknown }; threadId?: unknown })
          : null
      // The server broadcasts other threads' lifecycle events down every
      // connection, so a compaction only counts when it is this thread's.
      if (
        typeof record?.threadId === 'string' &&
        record.threadId !== threadId
      ) {
        return
      }
      if (
        method === 'thread/compacted' ||
        (method === 'item/completed' &&
          record?.item?.type === 'contextCompaction')
      ) {
        resolveCompacted?.()
      }
    })
    try {
      const permissionConfig = resolveCodexPermissionConfig(
        config.permissionConfig,
      )
      await rpc.request('thread/resume', {
        threadId,
        cwd: config.workingDirectory,
        approvalPolicy: permissionConfig.approvalPolicy,
        sandbox: permissionConfig.sandbox,
        ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
      })
      await rpc.request('thread/compact/start', { threadId })
      await compacted
      return {
        kind: 'compact',
        contextWindow: createUnavailableContextWindow(
          'Context compacted. Codex will report refreshed usage after the next turn.',
        ),
      }
    } finally {
      if (timeout) clearTimeout(timeout)
      // Releasing this connection is the whole teardown: the server it ran on
      // belongs to every other session too.
      connection.close()
    }
  }

  start(config: SessionStartConfig): SessionHandle {
    const accountLookup = this.accountLookup
    /**
     * The account this session's `codex app-server` runs under.
     *
     * A Codex session outlives its process but does not own one continuously:
     * the app-server is spawned lazily and torn down whenever the session is
     * released — which, since resource-release landed, is after every completed
     * turn. What is fixed for the session's life is the *credential*, because
     * every respawn re-reads it from the same closure. ADR 0007's "switching
     * accounts mid-conversation needs no process lifecycle management" is a
     * property of Claude's per-turn spawn model and does not carry over, so a
     * mid-session change is refused out loud rather than silently served by
     * whichever account the current process happens to hold.
     */
    const sessionAccountId = config.providerAccountId ?? null
    const debugSink = this.debugSink
    const sessionId = config.sessionId
    const listeners = {
      delta: [] as ((delta: SessionDelta) => void)[],
      status: [] as ((status: SessionStatus) => void)[],
      attention: [] as ((attention: AttentionState) => void)[],
      continuationToken: [] as ((token: string) => void)[],
      contextWindow: [] as ((contextWindow: SessionContextWindow) => void)[],
      activity: [] as ((activity: ActivitySignal) => void)[],
      heartbeat: [] as (() => void)[],
    }

    function fireHeartbeat(): void {
      listeners.heartbeat.forEach((cb) => cb())
    }

    function recordDebug(
      channel: ProviderDebugChannel,
      partial: Omit<
        ProviderDebugEntry,
        'sessionId' | 'providerId' | 'at' | 'channel'
      >,
    ): void {
      debugSink.record({
        sessionId,
        providerId: 'codex',
        at: Date.now(),
        channel,
        ...partial,
      })
      fireHeartbeat()
    }

    const serverHost = this.serverHosts.get({
      account: accountLookup(sessionAccountId),
    })
    let connection: CodexServerConnection | null = null
    let rpc: JsonRpcClient | null = null
    let connecting: Promise<JsonRpcClient | null> | null = null
    /**
     * The last server generation this session was told about, so a death is
     * mourned once however many ways the news arrives.
     */
    let mournedGeneration: number | null = null
    let warmUpNoted = false
    let stopped = false
    let threadId: string | null = config.continuationToken
    let threadReady = config.continuationToken === null
    /**
     * The thread resolution in flight, so two callers cannot each start one.
     *
     * `ensureServer` has had this shape since CX2-1 and `ensureThread` did not:
     * a session whose first `thread/start` was still on the wire when a second
     * message arrived saw `threadId === null` twice and started two threads,
     * keeping whichever id came back last and orphaning the other on the
     * resident server (MAR-2826, reproduced live on 0.153.4). Every caller
     * awaits the one promise instead.
     */
    let resolvingThread: Promise<string> | null = null
    /**
     * Whether the thread `threadId` names has carried no turn since the last
     * boundary — seeded from the ledger (`noTurnSinceBoundary`), set again when
     * a reset opens a fresh thread, and cleared the moment a turn is sent.
     *
     * It is the difference between the two refusals `thread/resume` spells the
     * same way: a thread that never took a turn (nothing to recover) and one
     * whose rollout is gone (context genuinely missing). See MAR-2854.
     */
    let threadUnusedSinceBoundary = config.noTurnSinceBoundary === true
    let assistantTextBuffer = ''
    let assistantMessageItemId: string | null = null
    let thinkingBuffer = ''
    let thinkingItemId: string | null = null
    let thinkingProviderItemId: string | null = null
    let thinkingProviderEventType: string | null = null
    let pendingThinkingProviderItemId: string | null = null
    const flushedThinkingByProviderItemId = new Map<
      string,
      {
        itemId: string
        text: string
      }
    >()
    let activeProviderTurnId: string | null = null
    /**
     * The `turn/start` acknowledgement in flight, resolving to the turn's id.
     *
     * It answers the one question two different paths need and neither can
     * infer: *is there a send whose fate is still undecided?* A connection
     * dying over it must not be turned into a terminal status before
     * reconciliation has read the thread (MAR-2823 F2), and Stop over it has a
     * turn to cancel whose id has simply not arrived yet (F1).
     */
    let pendingTurnStart: Promise<string | null> | null = null
    let deadInteractionNoted = false

    // Map of pending approval request IDs (JSON-RPC id → approval response plan)
    const pendingApprovals = new Map<JsonRpcId, PendingApprovalRequest>()
    const pendingUserInputs = new Map<JsonRpcId, PendingInputRequest>()

    function emitDelta(delta: SessionDelta): void {
      listeners.delta.forEach((cb) => cb(delta))
    }

    const sessionEmitter = new ProviderSessionEmitter({
      providerId: 'codex',
      emitDelta,
      now,
    })

    // What the session currently believes about itself. The process dying is
    // only news while a turn is outstanding, and only this tells us that.
    let currentStatus: SessionStatus = 'idle'

    function setStatus(status: SessionStatus): void {
      currentStatus = status
      listeners.status.forEach((cb) => cb(status))
      sessionEmitter.patchSession({ status })
    }

    function setAttention(attention: AttentionState): void {
      listeners.attention.forEach((cb) => cb(attention))
      sessionEmitter.patchSession({ attention })
    }

    function setContinuationToken(token: string): void {
      threadReady = true
      if (threadId === token) return

      threadId = token
      listeners.continuationToken.forEach((cb) => cb(token))
      sessionEmitter.patchSession({ continuationToken: token })
    }

    function markThreadReady(): void {
      threadReady = true
    }

    function setContextWindow(contextWindow: SessionContextWindow): void {
      listeners.contextWindow.forEach((cb) => cb(contextWindow))
      sessionEmitter.patchSession({ contextWindow })
    }

    let activityState: CodexActivityState = initialCodexActivityState()
    function applyActivity(
      input: Parameters<typeof reduceCodexActivity>[1],
    ): void {
      const { state, activity } = reduceCodexActivity(activityState, input)
      activityState = state
      if (activity !== 'keep') {
        listeners.activity.forEach((cb) => cb(activity))
        sessionEmitter.patchSession({ activity })
      }
    }

    function flushAssistantBuffer(): void {
      if (assistantTextBuffer) {
        const timestamp = now()
        if (assistantMessageItemId) {
          sessionEmitter.patchMessage(assistantMessageItemId, {
            text: assistantTextBuffer,
            state: 'complete',
            updatedAt: timestamp,
          })
        } else {
          assistantMessageItemId = sessionEmitter.addAssistantMessage({
            text: assistantTextBuffer,
            state: 'complete',
            timestamp,
          })
        }
        assistantTextBuffer = ''
        assistantMessageItemId = null
      }
    }

    function flushThinkingBuffer(input?: {
      providerItemId?: string | null
      providerEventType?: string | null
    }): void {
      if (thinkingBuffer) {
        const timestamp = now()
        const providerItemId =
          input?.providerItemId ??
          thinkingProviderItemId ??
          pendingThinkingProviderItemId
        const providerEventType =
          input?.providerEventType ?? thinkingProviderEventType
        let flushedItemId: string
        if (thinkingItemId) {
          sessionEmitter.patchThinking(thinkingItemId, {
            text: thinkingBuffer,
            state: 'complete',
            updatedAt: timestamp,
          })
          flushedItemId = thinkingItemId
        } else {
          flushedItemId = sessionEmitter.addThinking({
            text: thinkingBuffer,
            state: 'complete',
            timestamp,
            providerItemId,
            providerEventType,
          })
        }
        if (providerItemId) {
          flushedThinkingByProviderItemId.set(providerItemId, {
            itemId: flushedItemId,
            text: thinkingBuffer,
          })
        }
        thinkingBuffer = ''
        thinkingItemId = null
        thinkingProviderItemId = null
        thinkingProviderEventType = null
      }
    }

    function appendThinking(input: {
      text: string
      providerItemId?: string | null
      providerEventType?: string | null
    }): void {
      if (!input.text) return
      if (input.providerItemId) {
        thinkingProviderItemId = input.providerItemId
      }
      if (input.providerEventType) {
        thinkingProviderEventType = input.providerEventType
      }
      thinkingBuffer += input.text
      if (!thinkingItemId) {
        thinkingItemId = sessionEmitter.addThinking({
          text: thinkingBuffer,
          state: 'streaming',
          providerItemId: thinkingProviderItemId,
          providerEventType: thinkingProviderEventType,
        })
      } else {
        sessionEmitter.patchThinking(thinkingItemId, {
          text: thinkingBuffer,
          state: 'streaming',
        })
      }
    }

    function readThreadId(payload: unknown): string | null {
      if (!payload || typeof payload !== 'object') return null
      const record = payload as {
        threadId?: unknown
        thread?: { id?: unknown }
      }

      if (typeof record.threadId === 'string') {
        return record.threadId
      }

      if (typeof record.thread?.id === 'string') {
        return record.thread.id
      }

      return null
    }

    function readProviderTurnId(payload: unknown): string | null {
      if (!payload || typeof payload !== 'object') return null
      const record = payload as {
        turnId?: unknown
        turn?: { id?: unknown; turnId?: unknown }
      }

      if (typeof record.turnId === 'string') {
        return record.turnId
      }

      if (typeof record.turn?.id === 'string') {
        return record.turn.id
      }

      if (typeof record.turn?.turnId === 'string') {
        return record.turn.turnId
      }

      return null
    }

    async function startFreshThread(activeRpc: JsonRpcClient): Promise<string> {
      const permissionConfig = resolveCodexPermissionConfig(
        config.permissionConfig,
      )
      const threadResult = await activeRpc.request('thread/start', {
        cwd: config.workingDirectory,
        approvalPolicy: permissionConfig.approvalPolicy,
        sandbox: permissionConfig.sandbox,
        ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
      })

      const discoveredThreadId = readThreadId(threadResult)
      if (!discoveredThreadId) {
        // Nothing left to wait for: the id arrives in this request's own
        // result or not at all. The session's own `thread/started` is dropped
        // while `threadId` is null (routing by thread id, constitution A2), so
        // a waiter for it could only ever spend its budget and then fail with
        // this sentence — 0.153.4 always carries the id here (measured), and a
        // server that does not is broken now rather than in a minute.
        throw new Error('thread/start response did not include a thread id')
      }

      setContinuationToken(discoveredThreadId)
      return discoveredThreadId
    }

    /**
     * Everything this session knew about its thread's readiness, dropped.
     *
     * One helper rather than the same pair of assignments at each connection
     * change: a resolution in flight belongs to the connection it was issued
     * on, so a connection that goes takes it with it, and a caller arriving on
     * the new one must not be handed the dead promise to await.
     */
    function forgetThreadReadiness(): void {
      threadReady = false
      resolvingThread = null
    }

    async function resumeExistingThread(
      activeRpc: JsonRpcClient,
      continuationThreadId: string,
    ): Promise<string> {
      try {
        const permissionConfig = resolveCodexPermissionConfig(
          config.permissionConfig,
        )
        const threadResult = await activeRpc.request('thread/resume', {
          threadId: continuationThreadId,
          cwd: config.workingDirectory,
          approvalPolicy: permissionConfig.approvalPolicy,
          sandbox: permissionConfig.sandbox,
          ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
        })

        const discoveredThreadId = readThreadId(threadResult)
        if (discoveredThreadId) {
          setContinuationToken(discoveredThreadId)
          return discoveredThreadId
        }

        markThreadReady()
        return continuationThreadId
      } catch (err) {
        if (!isCodexThreadNotFoundError(err)) {
          throw err
        }

        // A refused resume is only a recovery when something could have been
        // lost. A thread that has taken no turn since the last boundary has no
        // rollout for the server to find — that is what a deliberate `/clear`
        // leaves behind — so starting another one restores nothing and warning
        // about missing context contradicts the boundary drawn two lines above
        // it in the same transcript (MAR-2854).
        //
        // The refusal's own wording cannot make this call: a rollout pruned off
        // disk from a conversation that *did* run is refused in exactly the same
        // words, and there the warning is true and has to survive. Only the
        // ledger knows which of the two happened, and it was asked before this
        // session started.
        if (!threadUnusedSinceBoundary) {
          const recoveryEntry = buildCodexThreadRecoveryEntry(now())
          sessionEmitter.addNote({
            text: recoveryEntry.text,
            level: recoveryEntry.level,
            timestamp: recoveryEntry.timestamp,
          })
        }

        threadId = null
        threadReady = false
        return startFreshThread(activeRpc)
      }
    }

    /**
     * The session's thread, resolved once however many callers ask at once.
     */
    async function ensureThread(activeRpc: JsonRpcClient): Promise<string> {
      if (threadId && threadReady) return threadId
      if (resolvingThread) return resolvingThread

      const currentThreadId = threadId
      const attempt = currentThreadId
        ? resumeExistingThread(activeRpc, currentThreadId)
        : startFreshThread(activeRpc)
      resolvingThread = attempt
      try {
        return await attempt
      } finally {
        if (resolvingThread === attempt) resolvingThread = null
      }
    }

    /**
     * Sends `turn/start` and remembers the turn the server reports.
     *
     * `clientUserMessageId` is ours: the server records it on the user message
     * it stores (measured: `items[].clientId`), which is what makes a turn we
     * sent but never saw acknowledged findable afterwards instead of guessable
     * (constitution A6).
     */
    async function requestTurnStart(
      activeRpc: JsonRpcClient,
      currentThreadId: string,
      input: CodexUserInput[],
      clientUserMessageId: string,
    ): Promise<void> {
      // Sent, not acknowledged: a turn the server took but never answered for
      // still carried this thread past the boundary, and claiming otherwise is
      // the one direction this flag must never fail in.
      threadUnusedSinceBoundary = false
      const acknowledgement = activeRpc
        .request('turn/start', {
          threadId: currentThreadId,
          model: config.model,
          effort: config.effort,
          ...(config.serviceTier ? { serviceTier: config.serviceTier } : {}),
          clientUserMessageId,
          input,
        })
        .then((turnResult) => readProviderTurnId(turnResult))
      pendingTurnStart = acknowledgement

      try {
        const providerTurnId = await acknowledgement
        if (providerTurnId) {
          activeProviderTurnId = providerTurnId
        }
      } finally {
        if (pendingTurnStart === acknowledgement) {
          pendingTurnStart = null
        }
      }
    }

    /**
     * Whether a turn we sent but never saw acknowledged actually reached Codex.
     *
     * A thread with no turn yet answers both `thread/resume` and
     * `thread/turns/list` with "no rollout found" / "not materialized yet"
     * (measured) — for this question that refusal is an answer, not an error.
     * Any *other* failure leaves the question unanswered, and an unanswered
     * question must never become a resend: duplicating a turn the model already
     * ran is worse than asking the user to send it again. A payload we could
     * not read is exactly such an unanswered question, however cleanly the RPC
     * itself succeeded (MAR-2823 F5).
     */
    async function reconcileTurn(
      activeRpc: JsonRpcClient,
      currentThreadId: string,
      clientUserMessageId: string,
    ): Promise<
      | { outcome: 'landed'; turn: CodexLandedTurn | null }
      | { outcome: 'absent' }
      | { outcome: 'unknown' }
    > {
      try {
        const turns = await activeRpc.request('thread/turns/list', {
          threadId: currentThreadId,
        })
        const landing = threadContainsClientMessage(turns, clientUserMessageId)
        if (landing === 'unreadable') return { outcome: 'unknown' }
        if (landing === false) return { outcome: 'absent' }
        return {
          outcome: 'landed',
          turn: readLandedTurn(turns, clientUserMessageId),
        }
      } catch (err) {
        if (isCodexThreadUnmaterializedError(err)) return { outcome: 'absent' }
        return { outcome: 'unknown' }
      }
    }

    /**
     * Rejoins a turn the server had already taken.
     *
     * Noting it was not enough. The thread was read on a connection that had
     * subscribed to nothing, so a turn still executing streamed to no one and a
     * turn that had already answered left its answer on the server: the session
     * sat at `running` until something else ended it (MAR-2823 F4). Adoption is
     * therefore the subscription, the turn's id back (so steer and interrupt
     * still reach it), and — when the model has already finished — its answer
     * in the transcript.
     */
    function adoptLandedTurn(turn: CodexLandedTurn | null): void {
      sessionEmitter.addNote({
        text: 'The connection dropped after Codex had already taken this message, so it was not sent again. Its answer continues in the next reply.',
        level: 'warning',
        timestamp: now(),
      })

      if (turn?.turnId) {
        activeProviderTurnId = turn.turnId
      }

      if (!turn?.completed) {
        // Still running on the server, and this connection is subscribed to it
        // now: the rest arrives as ordinary notifications.
        setStatus('running')
        setAttention('none')
        return
      }

      if (turn.agentText) {
        sessionEmitter.addAssistantMessage({
          text: turn.agentText,
          state: 'complete',
          timestamp: now(),
        })
      }
      activeProviderTurnId = null
      applyActivity({ kind: 'close' })
      setStatus('completed')
      setAttention('none')
    }

    /**
     * Reconnects after the connection died under an unacknowledged turn, and
     * decides between adopting and resending by reading the thread.
     *
     * The thread is resumed *before* it is read, and the order is the point: a
     * turn that finishes between the read and the subscription would otherwise
     * announce itself to nobody, leaving a session that reconciled correctly
     * still waiting forever.
     */
    async function recoverUnacknowledgedTurn(input: {
      threadIdAtSend: string
      clientUserMessageId: string
      turnInput: CodexUserInput[]
    }): Promise<void> {
      const recovered = await openConnection()
      if (!recovered || stopped) return

      const resumedThreadId = await ensureThread(recovered)
      if (resumedThreadId !== input.threadIdAtSend) {
        // The thread we sent to is gone — the server refused to resume it and
        // a fresh one took its place — so nothing can have landed on it.
        await requestTurnStart(
          recovered,
          resumedThreadId,
          input.turnInput,
          input.clientUserMessageId,
        )
        return
      }

      const reconciled = await reconcileTurn(
        recovered,
        input.threadIdAtSend,
        input.clientUserMessageId,
      )
      if (stopped) return

      if (reconciled.outcome === 'landed') {
        adoptLandedTurn(reconciled.turn)
        return
      }

      if (reconciled.outcome === 'unknown') {
        throw new Error(
          'Lost the connection while sending, and Codex could not be asked whether the message arrived. Send it again if no answer appears.',
        )
      }

      await requestTurnStart(
        recovered,
        resumedThreadId,
        input.turnInput,
        input.clientUserMessageId,
      )
    }

    async function startTurn(
      activeRpc: JsonRpcClient,
      input: CodexUserInput[],
    ): Promise<void> {
      assistantTextBuffer = ''
      assistantMessageItemId = null
      thinkingBuffer = ''
      thinkingItemId = null
      thinkingProviderItemId = null
      thinkingProviderEventType = null
      pendingThinkingProviderItemId = null
      flushedThinkingByProviderItemId.clear()
      const currentThreadId = await ensureThread(activeRpc)
      const clientUserMessageId = randomUUID()

      try {
        await requestTurnStart(
          activeRpc,
          currentThreadId,
          input,
          clientUserMessageId,
        )
      } catch (err) {
        // The connection this turn was sent on is gone: `abandonConnection`
        // cleared it, or a reconnect already replaced it. Whether Codex ran the
        // turn anyway is a question with an answer on the server, so it gets
        // asked rather than guessed (constitution A6).
        if (rpc === null || rpc !== activeRpc) {
          await recoverUnacknowledgedTurn({
            threadIdAtSend: currentThreadId,
            clientUserMessageId,
            turnInput: input,
          })
          return
        }

        if (!threadId || !isCodexThreadNotFoundError(err)) {
          throw err
        }

        const recoveryEntry = buildCodexThreadRecoveryEntry(now())
        sessionEmitter.addNote({
          text: recoveryEntry.text,
          level: recoveryEntry.level,
          timestamp: recoveryEntry.timestamp,
        })
        threadId = null
        threadReady = false
        const recoveredThreadId = await startFreshThread(activeRpc)
        await requestTurnStart(
          activeRpc,
          recoveredThreadId,
          input,
          clientUserMessageId,
        )
      }
    }

    async function resolveSelectedSkills(
      activeRpc: JsonRpcClient,
      selections: SkillSelection[] | undefined,
    ): Promise<CodexSkillInvocationResolution> {
      if (!selections || selections.length === 0) {
        return { ok: true, skillInputs: [] }
      }

      try {
        const payload = await activeRpc.request('skills/list', {
          cwds: [config.workingDirectory],
          forceReload: true,
        })
        return resolveCodexSkillInvocation({
          catalog: mapCodexSkillCatalog(payload),
          selections,
        })
      } catch (err) {
        return failedCodexSkillInvocation(selections, err)
      }
    }

    function addSkillInvocationFailureNote(
      resolution: Extract<CodexSkillInvocationResolution, { ok: false }>,
    ): void {
      sessionEmitter.addNote({
        text: `Codex skill ${resolution.status}: ${resolution.message}`,
        level: 'error',
      })
    }

    function patchUserMessageSkills(
      userMessageItemId: string,
      selections: SkillSelection[] | undefined,
      status: Parameters<typeof markSkillSelectionsStatus>[1],
    ): void {
      const updatedSelections = markSkillSelectionsStatus(selections, status)
      if (!updatedSelections) {
        return
      }

      sessionEmitter.patchMessage(userMessageItemId, {
        skillSelections: updatedSelections,
      })
    }

    async function sendCodexTurn(input: {
      activeRpc: JsonRpcClient
      text: string
      attachments?: Attachment[]
      skillSelections?: SkillSelection[]
    }): Promise<void> {
      if (input.text === CONVERSATION_RESET_COMMAND) {
        const oldThreadId = threadId
        setStatus('running')
        setAttention('none')
        await startFreshThread(input.activeRpc)
        // The thread this boundary opens has taken nothing, and the ledger will
        // say so to whichever handle carries the next message (MAR-2854).
        threadUnusedSinceBoundary = true
        await unsubscribeThread(input.activeRpc, oldThreadId)
        if (oldThreadId !== null) {
          sessionEmitter.addNote({
            text: CONTEXT_RESTARTED_NOTE_TEXT,
            level: 'warning',
            providerEventType: SESSION_RESTARTED_EVENT_TYPE,
          })
        }
        setStatus('completed')
        setAttention('finished')
        return
      }
      const skillResolution = await resolveSelectedSkills(
        input.activeRpc,
        input.skillSelections,
      )
      const userMessageItemId = sessionEmitter.addUserMessage({
        text: input.text,
        skillSelections: skillResolution.skillSelections,
        attachmentIds: input.attachments?.length
          ? input.attachments.map((a) => a.id)
          : undefined,
      })
      setStatus('running')
      setAttention('none')

      if (!skillResolution.ok) {
        addSkillInvocationFailureNote(skillResolution)
        setStatus('failed')
        setAttention('failed')
        return
      }

      const skillInputs: CodexSkillInput[] = skillResolution.skillInputs

      try {
        const parts = await loadCodexParts(input.attachments)
        await startTurn(
          input.activeRpc,
          buildCodexUserInput({
            text: input.text,
            parts,
            skills: skillInputs,
          }),
        )
        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'sent',
        )
      } catch (err) {
        patchUserMessageSkills(
          userMessageItemId,
          skillResolution.skillSelections,
          'failed',
        )
        const failureEntry = buildTurnFailureEntry(err, now())
        sessionEmitter.addNote({
          text: failureEntry.text,
          level: failureEntry.level,
          timestamp: failureEntry.timestamp,
        })
        setStatus('failed')
        setAttention('failed')
      }
    }

    async function sendCodexSteer(input: {
      activeRpc: JsonRpcClient
      text: string
      attachments?: Attachment[]
      skillSelections?: SkillSelection[]
      expectedProviderTurnId?: string | null
    }): Promise<void> {
      const expectedTurnId =
        input.expectedProviderTurnId ?? activeProviderTurnId
      if (!expectedTurnId) {
        throw new Error('No active Codex turn is available to steer')
      }

      const skillResolution = await resolveSelectedSkills(
        input.activeRpc,
        input.skillSelections,
      )
      if (!skillResolution.ok) {
        addSkillInvocationFailureNote(skillResolution)
        return
      }

      sessionEmitter.addUserMessage({
        text: input.text,
        skillSelections: skillResolution.skillSelections,
        attachmentIds: input.attachments?.length
          ? input.attachments.map((a) => a.id)
          : undefined,
        deliveryMode: 'steer',
      })

      const currentThreadId = await ensureThread(input.activeRpc)
      const parts = await loadCodexParts(input.attachments)
      await input.activeRpc.request('turn/steer', {
        threadId: currentThreadId,
        expectedTurnId,
        input: buildCodexUserInput({
          text: input.text,
          parts,
          skills: skillResolution.skillInputs,
        }),
      })
    }

    async function interruptCodexTurn(input: {
      activeRpc: JsonRpcClient
      expectedProviderTurnId?: string | null
    }): Promise<void> {
      const turnId = input.expectedProviderTurnId ?? activeProviderTurnId
      if (!turnId) {
        throw new Error('No active Codex turn is available to interrupt')
      }

      const currentThreadId = await ensureThread(input.activeRpc)
      await input.activeRpc.request('turn/interrupt', {
        threadId: currentThreadId,
        turnId,
      })
      activeProviderTurnId = null
    }

    function addMidRunInputFailureNote(err: unknown): void {
      sessionEmitter.addNote({
        text: `Mid-run input failed: ${err instanceof Error ? err.message : String(err)}`,
        level: 'error',
        timestamp: now(),
      })
    }

    /**
     * Answer everything the user was being asked for, when the process that
     * asked is gone.
     *
     * A pending approval used to outlive its connection: the map still held
     * it, the session still showed "needs approval", and the click went to
     * `if (!rpc) return` — swallowed, forever (MAR-2317).
     */
    function endPendingInteractions(): void {
      const abandoned = pendingApprovals.size + pendingUserInputs.size
      if (abandoned === 0) return

      pendingApprovals.clear()
      pendingUserInputs.clear()
      sessionEmitter.addNote({
        text:
          abandoned === 1
            ? 'The Codex connection ended while it was waiting on you. Nothing was approved or answered.'
            : `The Codex connection ended while it was waiting on you (${abandoned} requests). Nothing was approved or answered.`,
        level: 'warning',
        timestamp: now(),
      })
      setAttention('none')
    }

    function answerApproval(
      providerApprovalId: string | undefined,
      decision: 'approve' | 'deny',
    ): void {
      const pendingApproval = findPendingApproval(
        pendingApprovals,
        providerApprovalId,
      )

      if (!pendingApproval || !rpc) {
        // The click is real even when there is nothing left to answer; saying
        // so beats the silent `if (!rpc) return` it replaces (MAR-2317).
        if (!rpc) noteInteractionHasNowhereToGo()
        if (pendingApproval) {
          pendingApprovals.delete(pendingApproval[0])
        }
        if (pendingApprovals.size === 0) {
          setAttention('none')
        }
        return
      }

      const [id, approvalRequest] = pendingApproval
      rpc.respond(
        id,
        decision === 'approve'
          ? approvalRequest.approveResult
          : approvalRequest.denyResult,
      )
      pendingApprovals.delete(id)
      if (pendingApprovals.size === 0) {
        setAttention('none')
      }
    }

    function noteInteractionHasNowhereToGo(): void {
      if (deadInteractionNoted) return
      deadInteractionNoted = true
      sessionEmitter.addNote({
        text: 'That request belonged to a Codex connection that has already ended, so the answer had nowhere to go. Send a message to reconnect.',
        level: 'warning',
        timestamp: now(),
      })
    }

    /**
     * Give up on this connection without giving up on the session — or on the
     * server.
     *
     * A hung request or a dead socket used to leave `rpc` truthy with nothing
     * behind it, so the next message skipped the reconnect at `sendMessage`
     * and wrote into a closed pipe — a hang with no way out (MAR-2316). What
     * has changed is the other half: the process on the far end belongs to
     * every other Codex session too, so this path never signals it (MAR-2823).
     */
    function abandonConnection(reason: string): void {
      if (stopped) return

      const abandoned = connection
      const abandonedGeneration = abandoned?.generation ?? null
      connection = null
      rpc = null
      // A fresh connection has resumed nothing, whatever the last one did.
      forgetThreadReadiness()
      endPendingInteractions()
      abandoned?.close()

      // The turn on that connection is over, whatever the server is doing:
      // nothing will ever answer it down a socket that is gone. The old
      // per-session process ended it for us — abandoning the connection killed
      // the child, and its exit handler failed the interrupted turn — so the
      // resident server has to end it here instead, and cannot wait on the
      // obituary grace for a process exit that is never coming. A resend that
      // succeeds says `turn/started` on the new connection and puts the
      // session back to `running` itself.
      //
      // **Except while a send is still undecided.** `failed` is a terminal
      // status, and the session service releases the handle the moment it sees
      // one — disposing the very object that was about to reconcile, so the
      // recovery below never ran and the socket's own note was swallowed with
      // it (MAR-2823 F2). Who owns the outcome is the seam: the provider
      // decides an interrupted send (adopt / resend / unknown) and only then
      // publishes a status; the service reacts to decided statuses.
      const reconciling = pendingTurnStart !== null
      const interruptedTurn = currentStatus === 'running'
      flushAssistantBuffer()
      activeProviderTurnId = null
      applyActivity({ kind: 'close' })
      if (interruptedTurn && !reconciling) {
        setStatus('failed')
        setAttention('failed')
      }

      // The socket usually notices a dying server before the process's own
      // exit is reported, and the exit is the half that carries the reason.
      const mourn = () => {
        if (stopped) return
        if (
          abandonedGeneration !== null &&
          mournedGeneration === abandonedGeneration
        ) {
          return
        }
        mournedGeneration = abandonedGeneration
        sessionEmitter.addNote({
          text: `Lost the connection to the Codex app-server: ${reason}. The next message reconnects and resumes this thread.`,
          level: 'error',
          timestamp: now(),
        })
      }
      const grace = setTimeout(mourn, CODEX_OBITUARY_GRACE_MS)
      grace.unref?.()
    }

    /**
     * The server itself died. Every session on it hears the process's own last
     * words, and the next message brings a new one up (MAR-2823).
     */
    const stopWatchingServer = serverHost.onDeath((obituary) => {
      if (stopped) return
      if (mournedGeneration === obituary.generation) return
      mournedGeneration = obituary.generation
      const dying = connection
      if (dying && dying.generation === obituary.generation) {
        connection = null
        rpc = null
        forgetThreadReadiness()
        endPendingInteractions()
        dying.close()
      }
      const interruptedTurn = currentStatus === 'running'
      activeProviderTurnId = null
      applyActivity({ kind: 'close' })
      sessionEmitter.addNote({
        text: obituary.note,
        level: 'error',
        timestamp: now(),
      })
      if (interruptedTurn) {
        setStatus('failed')
        setAttention('failed')
      }
    })

    /**
     * Whether a notification is this session's business.
     *
     * The server broadcasts `thread/started` and `thread/status/changed` to
     * every connection (measured: a second connection saw another session's
     * `thread/started` *before* that session's own response arrived), while
     * item and turn traffic reaches only this thread's subscriber. Routing is
     * therefore by thread id and never by "the latest one" — the rule that
     * stops a session adopting a stranger's thread (constitution A2).
     */
    function notificationBelongsToSession(params: unknown): boolean {
      const notificationThreadId = readThreadId(params)
      if (!notificationThreadId) return true
      return threadId !== null && notificationThreadId === threadId
    }

    /**
     * Opens this session's own connection to the resident server, starting the
     * server if it is not up yet.
     *
     * One connection per session is the routing (constitution R2): the thread's
     * stream is scoped to its subscriber, so nothing here has to demultiplex a
     * shared pipe, and a session releasing its connection cannot disturb
     * another's live turn.
     */
    async function openConnection(): Promise<JsonRpcClient | null> {
      if (stopped) return null
      if (rpc) return rpc
      if (connecting) return connecting

      const attempt = (async () => {
        if (!serverHost.isReady()) {
          noteWarmUp()
        }
        const opened = await serverHost.connect({
          onTransportFailure: (error) => abandonConnection(error.message),
          isProgressNotification: (_method, params) =>
            notificationBelongsToSession(params),
        })
        if (stopped) {
          opened.close()
          return null
        }
        connection = opened
        rpc = opened.rpc
        // This connection has resumed nothing, whatever the last one had done.
        // Without the reset, a reconnect sent `turn/start` against a thread the
        // new connection had never subscribed to, and the session's survival
        // came down to whether the error wording happened to contain "not
        // found" (MAR-2317).
        forgetThreadReadiness()
        deadInteractionNoted = false
        attachHandlers(opened.rpc)
        return opened.rpc
      })()
        .catch((err) => {
          if (!stopped) {
            sessionEmitter.addNote({
              text: `Could not reach the Codex app-server: ${err instanceof Error ? err.message : String(err)}`,
              level: 'error',
              timestamp: now(),
            })
          }
          throw err
        })
        .finally(() => {
          connecting = null
        })

      connecting = attempt
      return attempt
    }

    /**
     * The honest state while the resident server is still coming up.
     *
     * A cold start is 7–25s on this machine, paid once per app launch. Saying
     * so beats a turn that looks dead for half a minute (MAR-2823, Build 4).
     */
    function noteWarmUp(): void {
      if (warmUpNoted) return
      warmUpNoted = true
      sessionEmitter.addNote({
        text: 'Codex is starting up. Your message goes out as soon as it is ready.',
        level: 'info',
        timestamp: now(),
      })
    }

    function startFirstTurn(
      initialMessage: string,
      initialAttachments?: Attachment[],
      initialSkillSelections?: SkillSelection[],
    ): void {
      void openConnection()
        .then((activeRpc) => {
          if (!activeRpc || stopped) return
          return sendCodexTurn({
            activeRpc,
            text: initialMessage,
            attachments: initialAttachments,
            skillSelections: initialSkillSelections,
          })
        })
        .catch((err) => {
          if (stopped) return
          const failureEntry = buildTurnFailureEntry(err, now())
          sessionEmitter.addNote({
            text:
              initialMessage === CONVERSATION_RESET_COMMAND
                ? `Could not clear the conversation: ${err instanceof Error ? err.message : String(err)}.${threadId ? ' The previous conversation is still active; your next message will resume it.' : ' No conversation was started.'}`
                : failureEntry.text,
            level: failureEntry.level,
            timestamp: failureEntry.timestamp,
          })
          setStatus('failed')
          setAttention('failed')
        })
    }

    function attachHandlers(activeRpc: JsonRpcClient): void {
      // Handle notifications (no response needed)
      activeRpc.onNotification((method, params) => {
        if (stopped) return
        // Another session's thread, broadcast down this connection: not ours
        // to record, count as activity, or act on (constitution A2).
        if (!notificationBelongsToSession(params)) return
        recordDebug('notification', {
          direction: 'in',
          method,
          payload: params,
        })
        applyActivity({ kind: 'notification', method, params })
        const p = params as Record<string, unknown>

        switch (method) {
          case 'turn/started':
            {
              const providerTurnId = readProviderTurnId(params)
              if (providerTurnId) {
                activeProviderTurnId = providerTurnId
              }
            }
            setStatus('running')
            setAttention('none')
            break

          case 'thread/tokenUsage/updated': {
            const contextWindow = deriveCodexContextWindow(
              (p.tokenUsage ?? p.usage ?? params) as {
                last?: { inputTokens?: unknown; cachedInputTokens?: unknown }
                modelContextWindow?: unknown
              },
            )
            if (contextWindow) {
              setContextWindow(contextWindow)
            }
            break
          }

          case 'item/agentMessage/delta':
            flushThinkingBuffer()
            if (typeof p.delta === 'string') {
              assistantTextBuffer += p.delta
            } else if (typeof p.textDelta === 'string') {
              assistantTextBuffer += p.textDelta
            }
            if (assistantTextBuffer) {
              if (!assistantMessageItemId) {
                assistantMessageItemId = sessionEmitter.addAssistantMessage({
                  text: assistantTextBuffer,
                  state: 'streaming',
                  providerEventType: method,
                })
              } else {
                sessionEmitter.patchMessage(assistantMessageItemId, {
                  text: assistantTextBuffer,
                  state: 'streaming',
                })
              }
            }
            break

          case 'item/reasoning/delta':
          case 'item/reasoning/textDelta':
          case 'item/reasoning/summaryTextDelta':
          case 'item/reasoning/summaryPartAdded': {
            const text = readReasoningDelta(p)
            if (text) {
              appendThinking({
                text,
                providerItemId:
                  readProviderItemId(p) ?? pendingThinkingProviderItemId,
                providerEventType: method,
              })
            }
            break
          }

          case 'turn/completed':
            flushThinkingBuffer()
            flushAssistantBuffer()
            activeProviderTurnId = null
            {
              const contextWindow = deriveCodexContextWindow(
                (p.usage ??
                  (typeof p.turn === 'object' && p.turn !== null
                    ? (p.turn as { usage?: unknown }).usage
                    : null) ??
                  params) as {
                  last?: {
                    inputTokens?: unknown
                    cachedInputTokens?: unknown
                  }
                  modelContextWindow?: unknown
                },
              )
              if (contextWindow) {
                setContextWindow(contextWindow)
              }
            }
            if (typeof p.turn === 'object' && p.turn !== null) {
              const turn = p.turn as {
                status?: unknown
                error?: { message?: unknown } | null
              }
              const errorMessage =
                typeof turn.error?.message === 'string'
                  ? turn.error.message
                  : null
              if (turn.status === 'failed' || errorMessage) {
                if (errorMessage) {
                  sessionEmitter.addNote({
                    text: errorMessage,
                    level: 'error',
                  })
                }
                setStatus('failed')
                setAttention('failed')
                break
              }
            }
            setStatus('completed')
            setAttention('finished')
            break

          case 'turn/interrupt':
            flushThinkingBuffer()
            flushAssistantBuffer()
            activeProviderTurnId = null
            sessionEmitter.addNote({
              text: 'Turn interrupted',
              level: 'warning',
            })
            break

          case 'serverRequest/resolved': {
            const requestId = (p.requestId ?? p.id) as JsonRpcId | undefined
            if (requestId !== undefined) {
              pendingApprovals.delete(requestId)
              pendingUserInputs.delete(requestId)
              if (pendingApprovals.size === 0 && pendingUserInputs.size === 0) {
                setAttention('none')
              }
            }
            break
          }

          case 'item/started': {
            const item =
              typeof p.item === 'object' && p.item !== null
                ? (p.item as Record<string, unknown>)
                : null
            const itemType = typeof item?.type === 'string' ? item.type : null

            if (isContextCompactionItemType(itemType)) {
              sessionEmitter.addNote({
                text: 'Compacting context...',
                level: 'info',
                providerEventType: itemType,
              })
            }
            if (isReasoningItemType(itemType)) {
              pendingThinkingProviderItemId = readProviderItemId(p, item)
            }
            break
          }

          case 'item/completed': {
            const item =
              typeof p.item === 'object' && p.item !== null
                ? (p.item as Record<string, unknown>)
                : null
            const itemType = typeof item?.type === 'string' ? item.type : null

            if (isContextCompactionItemType(itemType)) {
              sessionEmitter.addNote({
                text: 'Compaction complete',
                level: 'info',
                providerEventType: itemType,
              })
              break
            }

            if (isReasoningItemType(itemType)) {
              const text =
                readString(item?.text) ??
                readString(item?.summary) ??
                readString(item?.content) ??
                ''
              const providerItemId =
                readProviderItemId(p, item) ?? pendingThinkingProviderItemId
              const flushedThinking = providerItemId
                ? flushedThinkingByProviderItemId.get(providerItemId)
                : null
              if (flushedThinking) {
                if (text && text !== flushedThinking.text) {
                  sessionEmitter.patchThinking(flushedThinking.itemId, {
                    text,
                    state: 'complete',
                    updatedAt: now(),
                  })
                  flushedThinking.text = text
                }
                pendingThinkingProviderItemId = null
                break
              }
              if (!thinkingBuffer && text) {
                thinkingBuffer = text
              }
              flushThinkingBuffer({
                providerItemId,
                providerEventType: itemType,
              })
              pendingThinkingProviderItemId = null
              break
            }

            if (itemType === 'agentMessage') {
              const hadBufferedText = assistantTextBuffer.length > 0
              flushThinkingBuffer()
              flushAssistantBuffer()
              const text = typeof item?.text === 'string' ? item.text : ''
              if (text && !hadBufferedText) {
                sessionEmitter.addAssistantMessage({
                  text,
                  state: 'complete',
                  providerEventType: itemType,
                })
              }
              break
            }

            if (itemType === 'commandExecution') {
              const command =
                typeof item?.command === 'string' ? item.command : 'command'
              const output =
                typeof item?.aggregatedOutput === 'string'
                  ? item.aggregatedOutput
                  : typeof item?.exitCode === 'number'
                    ? `exit code ${item.exitCode}`
                    : 'Done'
              sessionEmitter.addToolResult({
                outputText: `${command}: ${output}`,
                toolName: command,
                providerEventType: itemType,
              })
              break
            }

            if (itemType === 'fileChange' || itemType === 'mcpToolCall') {
              sessionEmitter.addToolResult({
                outputText: JSON.stringify(item ?? 'Done'),
                providerEventType: itemType,
              })
            }
            break
          }

          case 'error': {
            flushAssistantBuffer()
            const message = readCodexErrorNotificationMessage(params)
            const disposition = classifyCodexErrorNotification(
              message,
              readCodexErrorWillRetry(params),
            )
            const note = buildCodexErrorNote(message, disposition, now())
            sessionEmitter.addNote({
              text: note.text,
              level: note.level,
              timestamp: note.timestamp,
            })

            // Only a message Codex itself calls terminal — `willRetry: false`
            // — or one we can name as terminal ends the session here. Retry
            // notices arrive on this same channel, and failing the session
            // releases the handle, which used to SIGTERM the app-server in the
            // middle of the retry it was about to survive (MAR-2315). For
            // everything else the server is the source of truth: if it is
            // really dying, its obituary says so.
            if (disposition === 'fatal') {
              activeProviderTurnId = null
              setStatus('failed')
              setAttention('failed')
            }
            break
          }
        }
      })

      // Handle server requests (need response — approvals)
      activeRpc.onServerRequest((method, params, id) => {
        if (stopped) return
        recordDebug('request', { direction: 'in', method, payload: params })
        applyActivity({ kind: 'request', method, params, requestId: id })
        const p = params as Record<string, unknown>

        const mcpElicitationRequest =
          method === 'mcpServer/elicitation/request'
            ? buildMcpElicitationInputRequest(p)
            : null
        if (mcpElicitationRequest) {
          flushAssistantBuffer()
          pendingUserInputs.set(id, mcpElicitationRequest.pending)

          sessionEmitter.addInputRequest({
            prompt: mcpElicitationRequest.prompt,
            request: mcpElicitationRequest.request,
            providerItemId: String(id),
            providerEventType: method,
          })
          setAttention('needs-input')
        } else if (
          method === 'mcpServer/elicitation/request' &&
          shouldFailUnsupportedMcpElicitation(p)
        ) {
          flushAssistantBuffer()
          rpc?.respondError(
            id,
            -32602,
            `Convergence could not render Codex MCP elicitation mode "${String(p.mode)}"`,
          )
          // Declining a mode we cannot render is a per-request outcome, not a
          // session outcome — the same lesson MAR-2033 applied to unknown
          // server requests below. Codex handles the `-32602` and the turn
          // keeps going (MAR-2315).
          sessionEmitter.addNote({
            text: `Codex asked for an MCP elicitation in "${String(p.mode)}" mode; Convergence declined it because it cannot render that mode yet.`,
            level: 'warning',
            providerEventType: method,
          })
        } else {
          const approvalRequest = buildCodexApprovalRequest(method, p)
          if (approvalRequest) {
            flushAssistantBuffer()
            pendingApprovals.set(id, approvalRequest)

            sessionEmitter.addApprovalRequest({
              description: approvalRequest.description,
              providerItemId: String(id),
              providerEventType: method,
            })
            setAttention('needs-approval')
          } else if (method === 'item/tool/requestUserInput') {
            flushAssistantBuffer()
            const inputRequest = buildCodexUserInputRequest(p)

            pendingUserInputs.set(id, inputRequest.pending)

            sessionEmitter.addInputRequest({
              prompt: inputRequest.prompt,
              request: inputRequest.request,
              providerItemId: String(id),
              providerEventType: method,
            })
            setAttention('needs-input')
          } else {
            // The app-server protocol grows new server requests continuously.
            // Declining one is a per-request outcome, not a session outcome:
            // Codex handles the `-32601` and the turn keeps going.
            flushAssistantBuffer()
            activeRpc.respondError(
              id,
              -32601,
              `Convergence does not support Codex server request "${method}" yet`,
            )
            sessionEmitter.addNote({
              text: `Codex asked for "${method}"; Convergence declined it because it does not support that request yet.`,
              level: 'warning',
              providerEventType: method,
            })
          }
        }
      })
    }

    // Connect after a tick so listeners can be attached
    const startTimer = setTimeout(() => {
      startFirstTurn(
        config.initialMessage,
        config.initialAttachments,
        config.initialSkillSelections,
      )
    }, 10)

    /**
     * Release the session.
     *
     * Releasing used to mean killing: the app-server was this session's own
     * process, so `disposeRuntime` SIGTERMed it after every completed turn and
     * the next message paid a cold start. Now the process is the app's, shared
     * by every Codex session, so release is a *subscription* ending — tell the
     * server we are done with the thread, then close our socket. No signal is
     * ever sent from here (MAR-2823); a session that skipped the unsubscribe
     * would still be correct, because the server drops an unsubscribed thread
     * after 30 idle minutes, but it would hold the thread loaded for nothing.
     */
    function disposeRuntime(options?: { interruptActiveTurn?: boolean }): void {
      if (stopped) return
      stopped = true
      clearTimeout(startTimer)
      stopWatchingServer()

      const releasing = connection
      const releasingThreadId = threadId
      const releasingThreadReady = threadReady
      // Captured before the reset below, because the release runs after it.
      const interruptTurnId = options?.interruptActiveTurn
        ? activeProviderTurnId
        : null
      const interruptPending = options?.interruptActiveTurn
        ? pendingTurnStart
        : null
      connection = null
      rpc = null
      pendingApprovals.clear()
      pendingUserInputs.clear()
      flushedThinkingByProviderItemId.clear()
      assistantTextBuffer = ''
      thinkingBuffer = ''
      activeProviderTurnId = null
      pendingTurnStart = null

      if (!releasing) return

      void releaseConnection({
        releasing,
        threadId: releasingThreadId,
        threadReady: releasingThreadReady,
        interruptTurnId,
        interruptPending,
      })
    }

    /**
     * Hands the connection back, in the one order that leaves nothing running.
     *
     * Under the per-session process, Stop cancelled the turn by killing the
     * process it ran in. On a resident server there is no such implicit
     * cancellation and no signal is permitted, so an explicit Stop has to say
     * so out loud: `turn/interrupt` first, then the unsubscribe, then the
     * socket. Without it the UI said stopped while the model kept working,
     * billing the account for an answer nobody would ever see (MAR-2823 F1).
     */
    async function releaseConnection(input: {
      releasing: CodexServerConnection
      threadId: string | null
      threadReady: boolean
      interruptTurnId: string | null
      interruptPending: Promise<string | null> | null
    }): Promise<void> {
      try {
        // A turn whose `turn/start` has not been answered yet has no id to
        // name; the acknowledgement carries it, so the interrupt waits for it
        // rather than letting the turn run on unnamed.
        const turnId =
          input.interruptTurnId ??
          (input.interruptPending
            ? await input.interruptPending.catch(() => null)
            : null)

        if (turnId && input.threadId) {
          await input.releasing.rpc.request('turn/interrupt', {
            threadId: input.threadId,
            turnId,
          })
        }
      } catch {
        // A server that cannot be told to stop is still owed the unsubscribe
        // below; reporting here would have nowhere to go — the session is
        // already released.
      }

      try {
        if (input.threadReady) {
          await unsubscribeThread(input.releasing.rpc, input.threadId)
        }
      } finally {
        input.releasing.close()
      }
    }

    /** Reset and disposal release subscriptions through the same protocol path. */
    async function unsubscribeThread(
      activeRpc: JsonRpcClient,
      releasingThreadId: string | null,
    ): Promise<void> {
      if (!releasingThreadId) return
      try {
        const result = await activeRpc.request('thread/unsubscribe', {
          threadId: releasingThreadId,
        })
        recordDebug('lifecycle', {
          direction: 'in',
          note: `thread/unsubscribe: ${readCodexUnsubscribeStatus(result) ?? 'unknown'}`,
        })
      } catch {
        // Best effort, as on disposal: the server also releases idle threads.
      }
    }

    const handle: SessionHandle = {
      onDelta: (cb) => {
        listeners.delta.push(cb)
      },
      onStatusChange: (cb) => {
        listeners.status.push(cb)
      },
      onAttentionChange: (cb) => {
        listeners.attention.push(cb)
      },
      onContinuationToken: (cb) => {
        listeners.continuationToken.push(cb)
        if (threadId) {
          cb(threadId)
        }
      },
      onContextWindowChange: (cb) => {
        listeners.contextWindow.push(cb)
      },
      onActivityChange: (cb) => {
        listeners.activity.push(cb)
      },
      onActivityHeartbeat: (cb) => {
        listeners.heartbeat.push(cb)
      },
      sendMessage: (text, attachments, skillSelections, options) => {
        if (stopped) return
        if (
          options?.providerAccountId !== undefined &&
          (options.providerAccountId ?? null) !== sessionAccountId
        ) {
          // Never silently serve the running account while the app claims
          // otherwise: Codex's transcript records no account attribution, so
          // nothing would contradict it later.
          sessionEmitter.addNote({
            text:
              'This Codex session is already running on the account it started ' +
              'with. Start a new session to use a different account.',
            level: 'error',
          })
          return
        }
        if (text === CONVERSATION_RESET_COMMAND) {
          if (currentStatus === 'running' || connecting) {
            throw new Error(
              'Wait for the current turn to finish before clearing the conversation.',
            )
          }
          startFirstTurn(text, attachments, skillSelections)
          return
        }
        if (!rpc) {
          startFirstTurn(text, attachments, skillSelections)
          return
        }

        const deliveryMode: MidRunInputMode = options?.deliveryMode ?? 'normal'
        const activeRpc = rpc

        const pendingUserInput = pendingUserInputs.entries().next().value as
          | [JsonRpcId, PendingInputRequest]
          | undefined
        if (pendingUserInput && deliveryMode !== 'steer') {
          const [requestId, request] = pendingUserInput
          const response = options?.interactionResponse
            ? buildStructuredCodexAnswer(request, options.interactionResponse)
            : buildLegacyCodexAnswer(request, text)
          rpc.respond(
            requestId,
            request.kind === 'questions' ? { answers: response } : response,
          )
          pendingUserInputs.delete(requestId)
          setAttention('none')
          return
        }

        if (deliveryMode === 'steer') {
          void sendCodexSteer({
            activeRpc,
            text,
            attachments,
            skillSelections,
            expectedProviderTurnId: options?.expectedProviderTurnId,
          }).catch((err) => {
            if (!stopped) addMidRunInputFailureNote(err)
          })
          return
        }

        if (deliveryMode === 'interrupt') {
          void interruptCodexTurn({
            activeRpc,
            expectedProviderTurnId: options?.expectedProviderTurnId,
          })
            .then(() =>
              sendCodexTurn({
                activeRpc,
                text,
                attachments,
                skillSelections,
              }),
            )
            .catch((err) => {
              if (!stopped) addMidRunInputFailureNote(err)
            })
          return
        }

        if (!threadId) {
          startFirstTurn(text, attachments, skillSelections)
          return
        }

        void sendCodexTurn({
          activeRpc,
          text,
          attachments,
          skillSelections,
        }).catch((err) => {
          if (stopped) return
          const failureEntry = buildTurnFailureEntry(err, now())
          sessionEmitter.addNote({
            text: failureEntry.text,
            level: failureEntry.level,
            timestamp: failureEntry.timestamp,
          })
          setStatus('failed')
          setAttention('failed')
        })
      },
      approve: (providerApprovalId) => {
        answerApproval(providerApprovalId, 'approve')
      },
      deny: (providerApprovalId) => {
        answerApproval(providerApprovalId, 'deny')
      },
      dispose: () => disposeRuntime(),
      stop: () => {
        if (stopped) return
        // Explicit Stop, unlike an ordinary release: there is a turn running on
        // a process that outlives this session, and only `turn/interrupt` ends
        // it (F1).
        disposeRuntime({ interruptActiveTurn: true })
        setStatus('failed')
        setAttention('failed')
      },
    }

    return handle
  }

  private async fetchDescriptor(): Promise<ProviderDescriptor> {
    const fallback = buildFallbackCodexDescriptor()

    // Deliberately ambient: this probe asks the binary what it can do. It
    // serves no turn and bills nobody, so scoping it to an account would only
    // make capability discovery depend on which account is selected — and it
    // rides the same resident server every session uses, so asking costs no
    // process at all.
    const result = (await this.serverHosts
      .get({ account: null })
      .run((rpc) =>
        rpc.request('model/list', { includeHidden: false, limit: 100 }),
      )) as { data?: unknown }

    const models = Array.isArray(result?.data) ? result.data : []
    if (models.length === 0) {
      return fallback
    }

    const modelOptions = models
      .map((model) => this.toModelOption(model))
      .filter((option): option is ProviderModelOption => option !== null)

    if (modelOptions.length === 0) {
      return fallback
    }

    const defaultModelId =
      this.readDefaultModelId(models) ??
      modelOptions[0]?.id ??
      fallback.defaultModelId

    return normalizeProviderDescriptor({
      ...fallback,
      defaultModelId,
      modelOptions,
    })
  }

  private toModelOption(model: unknown): ProviderModelOption | null {
    if (!model || typeof model !== 'object') return null
    const record = model as {
      model?: unknown
      displayName?: unknown
      hidden?: unknown
      defaultReasoningEffort?: unknown
      supportedReasoningEfforts?: Array<{
        reasoningEffort?: unknown
        description?: unknown
      }>
    }

    if (record.hidden === true || typeof record.model !== 'string') {
      return null
    }

    const effortOptions =
      record.supportedReasoningEfforts?.reduce<ProviderEffortOption[]>(
        (options, effort) => {
          const id = this.readReasoningEffort(effort?.reasoningEffort)
          if (!id) {
            return options
          }

          options.push({
            id,
            label: this.formatEffortLabel(id),
            description:
              typeof effort?.description === 'string'
                ? effort.description
                : undefined,
          })
          return options
        },
        [],
      ) ?? []

    return {
      id: record.model,
      label:
        typeof record.displayName === 'string' && record.displayName.trim()
          ? record.displayName
          : record.model,
      defaultEffort: this.readReasoningEffort(record.defaultReasoningEffort),
      effortOptions,
    }
  }

  private readDefaultModelId(models: unknown[]): string | null {
    for (const model of models) {
      if (!model || typeof model !== 'object') continue
      const record = model as { isDefault?: unknown; model?: unknown }
      if (record.isDefault === true && typeof record.model === 'string') {
        return record.model
      }
    }

    return null
  }

  private readReasoningEffort(value: unknown): ReasoningEffort | null {
    switch (value) {
      case 'none':
      case 'minimal':
      case 'low':
      case 'medium':
      case 'high':
      case 'max':
      case 'xhigh':
      case 'ultra':
        return value
      default:
        return null
    }
  }

  private formatEffortLabel(effort: ReasoningEffort): string {
    switch (effort) {
      case 'none':
        return 'None'
      case 'minimal':
        return 'Minimal'
      case 'low':
        return 'Low'
      case 'medium':
        return 'Medium'
      case 'high':
        return 'High'
      case 'max':
        return 'Max'
      case 'xhigh':
        return 'Very High'
      case 'ultra':
        return 'Ultra (multi-agent)'
    }
  }
}
