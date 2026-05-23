import { spawn, type ChildProcess } from 'child_process'
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
} from '../provider.types'
import { JsonRpcClient, type JsonRpcId } from './jsonrpc'
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
import { deriveCodexContextWindow } from '../context-window.pure'
import {
  buildCodexThreadRecoveryEntry,
  buildTurnFailureEntry,
  isCodexThreadNotFoundError,
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
import { createTaskProgressEmitter } from '../../task-progress/task-progress.emitter'
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import type {
  ProviderDebugChannel,
  ProviderDebugEntry,
} from '../../provider-debug/provider-debug.types'

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

function runCodexOneShot(
  binaryPath: string,
  input: OneShotInput,
  taskProgress?: TaskProgressService | null,
): Promise<OneShotResult> {
  return new Promise((resolve, reject) => {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--model',
      input.modelId,
      input.prompt,
    ]
    const child = spawn(binaryPath, args, {
      cwd: input.workingDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    const progress = createTaskProgressEmitter(input.requestId, taskProgress)
    progress?.started()

    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      progress?.settled('timeout')
      reject(new Error('codex oneShot timed out'))
    }, input.timeoutMs ?? 20000)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      progress?.stdoutChunk(chunk.length)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      progress?.stderrChunk(chunk.length)
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      progress?.settled('error')
      reject(err)
    })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (code !== 0) {
        progress?.settled('error')
        reject(
          new Error(
            `codex oneShot exited with code ${code}: ${stderr.trim() || 'no stderr'}`,
          ),
        )
        return
      }
      progress?.settled('ok')
      resolve({ text: extractCodexExecText(stdout) })
    })
  })
}

function extractCodexExecText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const lines = trimmed.split(/\r?\n/)
  const lastMarkerIndex = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*\[.*codex\s*\]\s*$/i.test(line))
    .map(({ index }) => index)
    .pop()

  if (lastMarkerIndex !== undefined) {
    return lines
      .slice(lastMarkerIndex + 1)
      .join('\n')
      .trim()
  }

  return trimmed
}

export class CodexProvider implements Provider {
  id = 'codex'
  name = 'Codex'
  supportsContinuation = true
  private descriptorPromise: Promise<ProviderDescriptor> | null = null

  constructor(
    private binaryPath: string,
    private taskProgress: TaskProgressService | null = null,
    private debugSink: ProviderDebugSink = noopDebugSink,
  ) {}

  describe(): Promise<ProviderDescriptor> {
    if (!this.descriptorPromise) {
      this.descriptorPromise = this.fetchDescriptor().catch(() =>
        buildFallbackCodexDescriptor(),
      )
    }

    return this.descriptorPromise
  }

  async oneShot(input: OneShotInput): Promise<OneShotResult> {
    return runCodexOneShot(this.binaryPath, input, this.taskProgress)
  }

  start(config: SessionStartConfig): SessionHandle {
    const binaryPath = this.binaryPath
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

    let child: ChildProcess | null = null
    let rpc: JsonRpcClient | null = null
    let stopped = false
    let threadId: string | null = config.continuationToken
    let threadReady = config.continuationToken === null
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
    let resolveThreadReady: (() => void) | null = null
    let activeProviderTurnId: string | null = null

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

    function setStatus(status: SessionStatus): void {
      listeners.status.forEach((cb) => cb(status))
      sessionEmitter.patchSession({ status })
    }

    function setAttention(attention: AttentionState): void {
      listeners.attention.forEach((cb) => cb(attention))
      sessionEmitter.patchSession({ attention })
    }

    function setContinuationToken(token: string): void {
      threadReady = true
      if (threadId === token) {
        resolveThreadReady?.()
        return
      }

      threadId = token
      listeners.continuationToken.forEach((cb) => cb(token))
      sessionEmitter.patchSession({ continuationToken: token })
      resolveThreadReady?.()
    }

    function markThreadReady(): void {
      threadReady = true
      resolveThreadReady?.()
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

    function waitForThreadId(): Promise<string> {
      if (threadId) {
        return Promise.resolve(threadId)
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolveThreadReady = null
          reject(new Error('thread/start response did not include a thread id'))
        }, 1000)

        resolveThreadReady = () => {
          clearTimeout(timeout)
          resolveThreadReady = null
          if (threadId) {
            resolve(threadId)
          } else {
            reject(
              new Error('thread/start response did not include a thread id'),
            )
          }
        }
      })
    }

    async function startFreshThread(activeRpc: JsonRpcClient): Promise<string> {
      const threadResult = await activeRpc.request('thread/start', {
        cwd: config.workingDirectory,
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
      })

      const discoveredThreadId = readThreadId(threadResult)
      if (discoveredThreadId) {
        setContinuationToken(discoveredThreadId)
      }
      if (!threadId) {
        threadId = await waitForThreadId()
      }

      return threadId
    }

    async function resumeExistingThread(
      activeRpc: JsonRpcClient,
      continuationThreadId: string,
    ): Promise<string> {
      try {
        const threadResult = await activeRpc.request('thread/resume', {
          threadId: continuationThreadId,
          cwd: config.workingDirectory,
          approvalPolicy: 'on-request',
          sandbox: 'workspace-write',
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

        const recoveryEntry = buildCodexThreadRecoveryEntry(now())
        sessionEmitter.addNote({
          text: recoveryEntry.text,
          level: recoveryEntry.level,
          timestamp: recoveryEntry.timestamp,
        })

        threadId = null
        threadReady = false
        return startFreshThread(activeRpc)
      }
    }

    async function ensureThread(activeRpc: JsonRpcClient): Promise<string> {
      if (threadId) {
        if (!threadReady) {
          return resumeExistingThread(activeRpc, threadId)
        }
        return threadId
      }

      return startFreshThread(activeRpc)
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

      try {
        const turnResult = await activeRpc.request('turn/start', {
          threadId: currentThreadId,
          model: config.model,
          effort: config.effort,
          input,
        })
        const providerTurnId = readProviderTurnId(turnResult)
        if (providerTurnId) {
          activeProviderTurnId = providerTurnId
        }
      } catch (err) {
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
        const turnResult = await activeRpc.request('turn/start', {
          threadId: recoveredThreadId,
          model: config.model,
          effort: config.effort,
          input,
        })
        const providerTurnId = readProviderTurnId(turnResult)
        if (providerTurnId) {
          activeProviderTurnId = providerTurnId
        }
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

    async function initialize(
      initialMessage: string,
      initialAttachments?: Attachment[],
      initialSkillSelections?: SkillSelection[],
    ): Promise<void> {
      if (!rpc || stopped) return

      try {
        // Handshake
        await rpc.request('initialize', {
          clientInfo: {
            name: 'convergence',
            title: 'Convergence',
            version: '0.0.0',
          },
          capabilities: {
            experimentalApi: true,
          },
        })
        rpc.notify('initialized')

        await sendCodexTurn({
          activeRpc: rpc,
          text: initialMessage,
          attachments: initialAttachments,
          skillSelections: initialSkillSelections,
        })
      } catch (err) {
        if (stopped) return
        sessionEmitter.addNote({
          text: `Initialization failed: ${err instanceof Error ? err.message : String(err)}`,
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
      }
    }

    function spawnServer(
      initialMessage: string,
      initialAttachments?: Attachment[],
      initialSkillSelections?: SkillSelection[],
    ): void {
      if (stopped) return
      if (child || rpc) return

      child = spawn(binaryPath, ['app-server'], {
        cwd: config.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      if (!child.stdin || !child.stdout) {
        sessionEmitter.addNote({
          text: 'Failed to open stdio',
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        return
      }

      rpc = new JsonRpcClient(child.stdin, child.stdout)

      // Handle notifications (no response needed)
      rpc.onNotification((method, params) => {
        if (stopped) return
        recordDebug('notification', {
          direction: 'in',
          method,
          payload: params,
        })
        applyActivity({ kind: 'notification', method, params })
        const p = params as Record<string, unknown>

        switch (method) {
          case 'thread/started':
            {
              const discoveredThreadId = readThreadId(params)
              if (discoveredThreadId) {
                setContinuationToken(discoveredThreadId)
              } else {
                resolveThreadReady?.()
              }
            }
            break

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
            activeProviderTurnId = null
            const error =
              typeof p.error === 'object' && p.error !== null
                ? (p.error as { message?: unknown })
                : null
            sessionEmitter.addNote({
              text: `Error: ${typeof error?.message === 'string' ? error.message : typeof p.message === 'string' ? p.message : 'Unknown error'}`,
              level: 'error',
            })
            setStatus('failed')
            setAttention('failed')
            break
          }
        }
      })

      // Handle server requests (need response — approvals)
      rpc.onServerRequest((method, params, id) => {
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
          sessionEmitter.addNote({
            text: `Unsupported Codex MCP elicitation schema for mode: ${String(p.mode)}`,
            level: 'error',
            providerEventType: method,
          })
          setStatus('failed')
          setAttention('failed')
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
            flushAssistantBuffer()
            rpc?.respondError(
              id,
              -32601,
              `Convergence does not support Codex server request "${method}" yet`,
            )
            sessionEmitter.addNote({
              text: `Unsupported Codex server request: ${method}`,
              level: 'error',
              providerEventType: method,
            })
            setStatus('failed')
            setAttention('failed')
          }
        }
      })

      child.stdout?.on('data', (chunk: Buffer) => {
        recordDebug('stdout', { direction: 'in', bytes: chunk.length })
      })

      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          recordDebug('stderr', { direction: 'in', bytes: chunk.length })
        })
      }

      child.on('exit', (code) => {
        recordDebug('lifecycle', {
          direction: 'in',
          note: `child exited with code ${code}`,
        })
        if (stopped) return
        flushAssistantBuffer()
        activeProviderTurnId = null
        applyActivity({ kind: 'close' })
        if (code !== 0 && code !== null) {
          sessionEmitter.addNote({
            text: `Process exited with code ${code}`,
            level: 'error',
          })
          setStatus('failed')
          setAttention('failed')
        }
        child = null
        rpc?.destroy()
        rpc = null
      })

      child.on('error', (err) => {
        recordDebug('lifecycle', {
          direction: 'in',
          note: `child error: ${err.message}`,
        })
        if (stopped) return
        activeProviderTurnId = null
        sessionEmitter.addNote({
          text: `Process error: ${err.message}`,
          level: 'error',
        })
        setStatus('failed')
        setAttention('failed')
        child = null
      })

      void initialize(
        initialMessage,
        initialAttachments,
        initialSkillSelections,
      )
    }

    // Spawn after a tick so listeners can be attached
    setTimeout(() => {
      spawnServer(
        config.initialMessage,
        config.initialAttachments,
        config.initialSkillSelections,
      )
    }, 10)

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
        if (!rpc) {
          spawnServer(text, attachments, skillSelections)
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
          spawnServer(text, attachments, skillSelections)
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
        if (!rpc) return
        const pendingApproval = findPendingApproval(
          pendingApprovals,
          providerApprovalId,
        )
        if (!pendingApproval) return

        const [id, approvalRequest] = pendingApproval
        rpc.respond(id, approvalRequest.approveResult)
        pendingApprovals.delete(id)
        if (pendingApprovals.size === 0) {
          setAttention('none')
        }
      },
      deny: (providerApprovalId) => {
        if (!rpc) return
        const pendingApproval = findPendingApproval(
          pendingApprovals,
          providerApprovalId,
        )
        if (!pendingApproval) return

        const [id, approvalRequest] = pendingApproval
        rpc.respond(id, approvalRequest.denyResult)
        pendingApprovals.delete(id)
        if (pendingApprovals.size === 0) {
          setAttention('none')
        }
      },
      stop: () => {
        stopped = true
        rpc?.destroy()
        rpc = null
        if (child) {
          child.kill('SIGTERM')
          setTimeout(() => {
            if (child && !child.killed) {
              child.kill('SIGKILL')
            }
          }, 3000)
          child = null
        }
        setStatus('failed')
        setAttention('failed')
      },
    }

    return handle
  }

  private async fetchDescriptor(): Promise<ProviderDescriptor> {
    const fallback = buildFallbackCodexDescriptor()

    const child = spawn(this.binaryPath, ['app-server'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    if (!child.stdin || !child.stdout) {
      child.kill('SIGTERM')
      return fallback
    }

    const rpc = new JsonRpcClient(child.stdin, child.stdout)
    if (child.stderr) {
      child.stderr.on('data', () => {
        // Drain stderr so discovery cannot block.
      })
    }

    try {
      await rpc.request('initialize', {
        clientInfo: {
          name: 'convergence',
          title: 'Convergence',
          version: '0.0.0',
        },
        capabilities: {
          experimentalApi: true,
        },
      })
      rpc.notify('initialized')

      const result = (await rpc.request('model/list', {
        includeHidden: false,
        limit: 100,
      })) as { data?: unknown }
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
    } finally {
      rpc.destroy()
      child.kill('SIGTERM')
    }
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
    }
  }
}
