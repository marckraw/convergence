import type {
  Attachment,
  AttachmentKind,
} from '../../attachments/attachments.types'
import type {
  ConversationItemState,
  InteractionChoiceOption,
  InteractionQuestion,
  InteractionRequest,
  InteractionResponse,
} from '../../session/conversation-item.types'
import type { SessionPermissionConfig } from '../provider.types'
import { normalizeSessionPermissionConfig } from '../session-permissions.pure'
import {
  mapCursorApprovalToAcpOptionId,
  redactCursorAcpPayload,
} from './cursor-acp-contract.pure'

type UnknownRecord = Record<string, unknown>

export interface CursorAcpMessagePart {
  kind: AttachmentKind
  mimeType: string
  filename: string
  storagePath: string
  bytes: Uint8Array
}

export type CursorAcpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string }

export interface CursorAcpPromptInput {
  text: string
  parts?: CursorAcpMessagePart[]
}

export interface CursorAcpToolView {
  toolCallId: string | null
  title: string
  kind: string | null
  status: string | null
  inputText: string
  outputText: string
  state: ConversationItemState
}

export interface CursorAcpPermissionRequest {
  description: string
  approveResult: unknown
  denyResult: unknown
  cancelResult: unknown
}

export interface PendingCursorAcpAskQuestion {
  kind: 'ask-question'
  toolCallId: string | null
  questions: Array<{
    questionId: string
    requestQuestionId: string
    options: Array<{
      id: string
      label: string
    }>
  }>
}

export interface PendingCursorAcpCreatePlan {
  kind: 'create-plan'
  toolCallId: string | null
}

export type PendingCursorAcpInteraction =
  | PendingCursorAcpAskQuestion
  | PendingCursorAcpCreatePlan

export interface CursorAcpInputRequest {
  prompt: string
  request: InteractionRequest
  pending: PendingCursorAcpInteraction
  cancelResult: unknown
}

export interface CursorAcpPassiveUpdateNote {
  text: string
  level: 'info' | 'warning' | 'error'
  providerItemId: string | null
}

export function partFromAttachment(
  attachment: Attachment,
  bytes: Uint8Array,
): CursorAcpMessagePart {
  return {
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    filename: attachment.filename,
    storagePath: attachment.storagePath,
    bytes,
  }
}

export function buildCursorAcpPrompt(
  input: CursorAcpPromptInput,
): CursorAcpContentBlock[] {
  const parts = input.parts ?? []
  const pdfs = parts.filter((part) => part.kind === 'pdf')
  if (pdfs.length > 0) {
    throw new Error('Cursor ACP does not support PDF attachments')
  }

  const content: CursorAcpContentBlock[] = []
  const images = parts.filter((part) => part.kind === 'image')
  const textParts = parts.filter((part) => part.kind === 'text')

  for (const image of images) {
    content.push({
      type: 'image',
      mimeType: image.mimeType,
      data: toBase64(image.bytes),
    })
  }

  const text = [
    ...textParts.map(
      (part) =>
        `<file path="${part.filename}">\n${decodeUtf8(part.bytes)}\n</file>`,
    ),
    input.text,
  ]
    .filter((part) => part.length > 0)
    .join('\n\n')

  if (text.length > 0 || content.length === 0) {
    content.push({ type: 'text', text })
  }

  return content
}

export function getCursorAcpSessionUpdate(
  params: unknown,
): UnknownRecord | null {
  const update =
    readField(params, 'update') ?? readField(params, 'sessionUpdate')
  if (isRecord(update)) return update
  return isRecord(params) ? params : null
}

export function getCursorAcpSessionUpdateType(params: unknown): string | null {
  const update = getCursorAcpSessionUpdate(params)
  return readStringField(update, 'sessionUpdate')
}

export function readCursorAcpContentText(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const text = value
      .map((item) => readCursorAcpContentText(item))
      .filter((item): item is string => item !== null && item.length > 0)
      .join('\n')
    return text.length > 0 ? text : null
  }
  if (!isRecord(value)) return null

  if (value.type === 'text') {
    return readTextField(value, 'text')
  }

  if (value.type === 'content') {
    return readCursorAcpContentText(value.content)
  }

  if (isRecord(value.resource)) {
    return (
      readTextField(value.resource, 'text') ??
      readStringField(value.resource, 'uri')
    )
  }

  return (
    readTextField(value, 'text') ??
    readCursorAcpContentText(value.content) ??
    readCursorAcpContentText(value.result)
  )
}

export function readCursorAcpUpdateText(params: unknown): string | null {
  const update = getCursorAcpSessionUpdate(params)
  return readCursorAcpContentText(readField(update, 'content'))
}

export function buildCursorAcpToolView(params: unknown): CursorAcpToolView {
  const update = getCursorAcpSessionUpdate(params)
  const toolCallId = readStringField(update, 'toolCallId')
  const title =
    readStringField(update, 'title') ??
    readStringField(update, 'name') ??
    readStringField(update, 'toolName') ??
    readStringField(update, 'kind') ??
    'Cursor tool'
  const kind = readStringField(update, 'kind')
  const status = readStringField(update, 'status')
  const contentText = readCursorAcpContentText(readField(update, 'content'))
  const rawInputText = formatUnknown(readField(update, 'rawInput'))
  const rawOutputText = formatUnknown(readField(update, 'rawOutput'))
  const locationsText = formatLocations(readField(update, 'locations'))
  const inputText = buildCursorAcpDescription([
    kind ? `Kind: ${kind}` : null,
    status ? `Status: ${status}` : null,
    rawInputText ? `Input:\n${rawInputText}` : null,
    locationsText ? `Locations:\n${locationsText}` : null,
  ])
  const outputText =
    contentText ??
    (rawOutputText ? `Output:\n${rawOutputText}` : null) ??
    (status ? `Status: ${status}` : 'Done')

  return {
    toolCallId,
    title,
    kind,
    status,
    inputText,
    outputText,
    state:
      status === 'failed' || status === 'error' || status === 'cancelled'
        ? 'error'
        : 'complete',
  }
}

export function buildCursorAcpPermissionRequest(
  params: unknown,
): CursorAcpPermissionRequest {
  const toolCall = readField(params, 'toolCall')
  const toolView = buildCursorAcpToolView(toolCall)
  const options = readArray(readField(params, 'options'))
    .map(formatPermissionOption)
    .filter((option): option is string => option !== null)

  return {
    description: buildCursorAcpDescription([
      'Cursor requests permission',
      toolView.title !== 'Cursor tool' ? toolView.title : null,
      toolView.kind ? `Kind: ${toolView.kind}` : null,
      toolView.inputText || null,
      options.length > 0 ? `Options: ${options.join(', ')}` : null,
    ]),
    approveResult: {
      outcome: {
        outcome: 'selected',
        optionId: mapCursorApprovalToAcpOptionId(true),
      },
    },
    denyResult: {
      outcome: {
        outcome: 'selected',
        optionId: mapCursorApprovalToAcpOptionId(false),
      },
    },
    cancelResult: {
      outcome: {
        outcome: 'cancelled',
      },
    },
  }
}

export function buildCursorAcpAskQuestionInputRequest(
  params: unknown,
): CursorAcpInputRequest | null {
  if (!isRecord(params)) return null

  const title =
    readStringField(params, 'title') ??
    readStringField(params, 'name') ??
    'Cursor asks a question'
  const normalizedQuestions = readArray(readField(params, 'questions'))
    .map(normalizeCursorAskQuestion)
    .filter(
      (
        question,
      ): question is {
        pending: PendingCursorAcpAskQuestion['questions'][number]
        question: InteractionQuestion
      } => question !== null,
    )

  if (normalizedQuestions.length === 0) return null

  const request: InteractionRequest = {
    kind: 'choice',
    questions: normalizedQuestions.map((question) => question.question),
  }
  const questionPrompts = normalizedQuestions
    .map((question) => question.question.question)
    .filter(Boolean)
  const prompt = [title, ...questionPrompts]
    .filter((part, index, parts) => part && parts.indexOf(part) === index)
    .join('\n\n')

  return {
    prompt,
    request,
    pending: {
      kind: 'ask-question',
      toolCallId: readStringField(params, 'toolCallId'),
      questions: normalizedQuestions.map((question) => question.pending),
    },
    cancelResult: {
      outcome: { outcome: 'cancelled' },
    },
  }
}

export function buildCursorAcpAskQuestionResponse(
  pending: PendingCursorAcpAskQuestion,
  response: InteractionResponse | undefined,
  fallbackText: string,
): unknown {
  const answersByQuestionId = new Map(
    response?.kind === 'choice'
      ? response.answers.map((answer) => [answer.questionId, answer.values])
      : [],
  )
  const fallbackValues = fallbackText.trim() ? [fallbackText.trim()] : []
  const answers = pending.questions.map((question, index) => {
    const values =
      answersByQuestionId.get(question.requestQuestionId) ??
      (index === 0 ? fallbackValues : [])
    return {
      questionId: question.questionId,
      selectedOptionIds: selectedCursorOptionIds(question.options, values),
    }
  })

  const hasAnswer = answers.some(
    (answer) => answer.selectedOptionIds.length > 0,
  )
  if (!hasAnswer) {
    return {
      outcome: {
        outcome: 'skipped',
        reason: fallbackText.trim() || 'No option selected',
      },
    }
  }

  return {
    outcome: {
      outcome: 'answered',
      answers,
    },
  }
}

export function buildCursorAcpCreatePlanInputRequest(
  params: unknown,
): CursorAcpInputRequest | null {
  if (!isRecord(params)) return null

  const name =
    readStringField(params, 'name') ??
    readStringField(params, 'title') ??
    'Cursor plan'
  const overview =
    readTextField(params, 'overview') ??
    readTextField(params, 'description') ??
    null
  const plan =
    readTextField(params, 'plan') ??
    readTextField(params, 'content') ??
    readTextField(params, 'markdown') ??
    readTextField(params, 'text')
  const todoText = formatCursorTodos(readField(params, 'todos'), 'Todos')
  const phasesText = formatCursorPlanPhases(readField(params, 'phases'))
  const planParts = [overview, plan, todoText, phasesText]
    .map((part) => part?.trim() ?? null)
    .filter((part): part is string => !!part)

  if (planParts.length === 0) return null

  const planText = planParts.join('\n\n')

  return {
    prompt: `Cursor requests plan approval: ${name}`,
    request: {
      kind: 'plan',
      plan: planText,
    },
    pending: {
      kind: 'create-plan',
      toolCallId: readStringField(params, 'toolCallId'),
    },
    cancelResult: {
      outcome: { outcome: 'cancelled' },
    },
  }
}

export function buildCursorAcpCreatePlanResponse(
  _pending: PendingCursorAcpCreatePlan,
  response: InteractionResponse | undefined,
  fallbackText: string,
): unknown {
  if (response?.kind === 'plan') {
    if (response.decision === 'approve') {
      return {
        outcome: {
          outcome: 'accepted',
        },
      }
    }

    return {
      outcome: {
        outcome: 'rejected',
        reason: response.message || fallbackText.trim() || undefined,
      },
    }
  }

  if (isAffirmativeText(fallbackText)) {
    return {
      outcome: {
        outcome: 'accepted',
      },
    }
  }

  const reason = fallbackText.trim()
  return {
    outcome: reason
      ? {
          outcome: 'rejected',
          reason,
        }
      : {
          outcome: 'cancelled',
        },
  }
}

export function buildCursorAcpInteractionResponse(
  pending: PendingCursorAcpInteraction,
  response: InteractionResponse | undefined,
  fallbackText: string,
): unknown {
  if (pending.kind === 'ask-question') {
    return buildCursorAcpAskQuestionResponse(pending, response, fallbackText)
  }

  return buildCursorAcpCreatePlanResponse(pending, response, fallbackText)
}

export function buildCursorAcpPassiveUpdateNote(
  method: string,
  params: unknown,
): CursorAcpPassiveUpdateNote | null {
  if (method === 'cursor/update_todos') {
    if (!isRecord(params)) return null
    const todosText = formatCursorTodos(readField(params, 'todos'), 'Todos')
    const merge = readField(params, 'merge')
    return {
      text: buildCursorAcpDescription([
        'Cursor todos updated',
        typeof merge === 'boolean' ? `Merge: ${merge ? 'yes' : 'no'}` : null,
        todosText,
      ]),
      level: 'info',
      providerItemId: readStringField(params, 'toolCallId'),
    }
  }

  if (method === 'cursor/task') {
    if (!isRecord(params)) return null
    const subagentType = formatCursorSubagentType(
      readField(params, 'subagentType'),
    )
    const durationMs = readNumberField(params, 'durationMs')
    return {
      text: buildCursorAcpDescription([
        readTextField(params, 'description') ?? 'Cursor task update',
        subagentType ? `Subagent: ${subagentType}` : null,
        readStringField(params, 'model')
          ? `Model: ${readStringField(params, 'model')}`
          : null,
        readStringField(params, 'agentId')
          ? `Agent: ${readStringField(params, 'agentId')}`
          : null,
        durationMs !== null ? `Duration: ${durationMs} ms` : null,
        readTextField(params, 'prompt')
          ? `Prompt:\n${readTextField(params, 'prompt')}`
          : null,
      ]),
      level: 'info',
      providerItemId: readStringField(params, 'toolCallId'),
    }
  }

  if (method === 'cursor/generate_image') {
    if (!isRecord(params)) return null
    const references = readArray(readField(params, 'referenceImagePaths'))
      .filter((path): path is string => typeof path === 'string' && !!path)
      .join('\n')
    return {
      text: buildCursorAcpDescription([
        'Cursor generated image payload received, but Convergence cannot render it as a shared artifact yet.',
        readTextField(params, 'description'),
        readStringField(params, 'filePath')
          ? `File: ${readStringField(params, 'filePath')}`
          : null,
        references ? `References:\n${references}` : null,
      ]),
      level: 'warning',
      providerItemId: readStringField(params, 'toolCallId'),
    }
  }

  return null
}

export function buildCursorAcpPassiveUpdateAcknowledgement(
  method: string,
  params: unknown,
): unknown {
  if (method === 'cursor/update_todos' && isRecord(params)) {
    return {
      outcome: {
        outcome: 'accepted',
        todos: readArray(readField(params, 'todos')),
      },
    }
  }

  if (method === 'cursor/task' && isRecord(params)) {
    return {
      outcome: {
        outcome: 'completed',
        ...(readStringField(params, 'agentId')
          ? { agentId: readStringField(params, 'agentId') }
          : {}),
        ...(readNumberField(params, 'durationMs') !== null
          ? { durationMs: readNumberField(params, 'durationMs') }
          : {}),
      },
    }
  }

  if (method === 'cursor/generate_image') {
    return {
      outcome: {
        outcome: 'rejected',
        reason:
          'Generated image artifacts are not supported by Convergence yet.',
      },
    }
  }

  return {}
}

export function shouldAutoApproveCursorPermissions(
  value: SessionPermissionConfig | null | undefined,
): boolean {
  return normalizeSessionPermissionConfig(value).preset === 'yolo'
}

function buildCursorAcpDescription(parts: Array<string | null>): string {
  const description = parts
    .map((part) => part?.trim() ?? null)
    .filter((part): part is string => !!part)
    .join('\n\n')
  return description || 'Cursor update'
}

function formatPermissionOption(value: unknown): string | null {
  if (!isRecord(value)) return null
  const name =
    readStringField(value, 'name') ??
    readStringField(value, 'label') ??
    readStringField(value, 'optionId')
  const kind = readStringField(value, 'kind')
  return [name, kind ? `(${kind})` : null]
    .filter((part): part is string => !!part)
    .join(' ')
}

function normalizeCursorAskQuestion(value: unknown): {
  pending: PendingCursorAcpAskQuestion['questions'][number]
  question: InteractionQuestion
} | null {
  if (!isRecord(value)) return null

  const prompt =
    readTextField(value, 'prompt') ??
    readTextField(value, 'question') ??
    readTextField(value, 'label') ??
    readStringField(value, 'id')
  if (!prompt) return null

  const questionId = readStringField(value, 'id') ?? prompt
  const normalizedOptions = readArray(readField(value, 'options'))
    .map(normalizeCursorAskQuestionOption)
    .filter(
      (
        option,
      ): option is {
        id: string
        label: string
        option: InteractionChoiceOption
      } => option !== null,
    )
  if (normalizedOptions.length === 0) return null

  return {
    pending: {
      questionId,
      requestQuestionId: questionId,
      options: normalizedOptions.map((option) => ({
        id: option.id,
        label: option.label,
      })),
    },
    question: {
      id: questionId,
      question: prompt,
      header: readTextField(value, 'header') ?? prompt,
      options: normalizedOptions.map((option) => option.option),
      multiSelect: readField(value, 'allowMultiple') === true,
    },
  }
}

function normalizeCursorAskQuestionOption(value: unknown): {
  id: string
  label: string
  option: InteractionChoiceOption
} | null {
  if (!isRecord(value)) return null
  const id =
    readStringField(value, 'id') ??
    readStringField(value, 'value') ??
    readStringField(value, 'label')
  const label =
    readTextField(value, 'label') ??
    readStringField(value, 'name') ??
    readStringField(value, 'value') ??
    id
  if (!id || !label) return null

  return {
    id,
    label,
    option: {
      label,
      description: readTextField(value, 'description') ?? undefined,
      preview: readTextField(value, 'preview') ?? undefined,
    },
  }
}

function selectedCursorOptionIds(
  options: PendingCursorAcpAskQuestion['questions'][number]['options'],
  values: string[],
): string[] {
  const selected = new Set<string>()
  for (const value of values) {
    const normalized = value.trim().toLocaleLowerCase()
    if (!normalized) continue
    const option = options.find(
      (candidate) =>
        candidate.id.toLocaleLowerCase() === normalized ||
        candidate.label.toLocaleLowerCase() === normalized,
    )
    if (option) selected.add(option.id)
  }
  return Array.from(selected)
}

function formatCursorTodos(value: unknown, title: string): string | null {
  const todos = readArray(value)
    .map(formatCursorTodo)
    .filter((todo): todo is string => todo !== null)
  return todos.length > 0 ? `${title}:\n${todos.join('\n')}` : null
}

function formatCursorTodo(value: unknown): string | null {
  if (!isRecord(value)) return null
  const content =
    readTextField(value, 'content') ??
    readTextField(value, 'description') ??
    readStringField(value, 'title') ??
    readStringField(value, 'id')
  if (!content) return null

  const status = readStringField(value, 'status')
  return `${status ? `[${status}] ` : ''}${content}`
}

function formatCursorPlanPhases(value: unknown): string | null {
  const phases = readArray(value)
    .map((phase) => {
      if (!isRecord(phase)) return null
      const name = readStringField(phase, 'name') ?? 'Phase'
      const todos = formatCursorTodos(readField(phase, 'todos'), name)
      return todos
    })
    .filter((phase): phase is string => phase !== null)
  return phases.length > 0 ? `Phases:\n${phases.join('\n\n')}` : null
}

function formatCursorSubagentType(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (isRecord(value)) {
    return readStringField(value, 'custom') ?? formatUnknown(value)
  }
  return null
}

function isAffirmativeText(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase()
  return ['approve', 'approved', 'accept', 'accepted', 'yes', 'y'].includes(
    normalized,
  )
}

function formatLocations(value: unknown): string | null {
  const locations = readArray(value)
    .map((location) => {
      if (!isRecord(location)) return null
      const path =
        readStringField(location, 'path') ??
        readStringField(location, 'uri') ??
        readStringField(location, 'file')
      if (!path) return null
      const line = readNumberField(location, 'line')
      return line === null ? path : `${path}:${line}`
    })
    .filter((location): location is string => location !== null)
  return locations.length > 0 ? locations.join('\n') : null
}

function formatUnknown(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(redactCursorAcpPayload(value), null, 2)
  } catch {
    return String(value)
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    'base64',
  )
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

function readField(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function readStringField(value: unknown, key: string): string | null {
  const field = readField(value, key)
  return typeof field === 'string' && field.trim() ? field.trim() : null
}

function readTextField(value: unknown, key: string): string | null {
  const field = readField(value, key)
  return typeof field === 'string' ? field : null
}

function readNumberField(value: unknown, key: string): number | null {
  const field = readField(value, key)
  return typeof field === 'number' && Number.isFinite(field) ? field : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
