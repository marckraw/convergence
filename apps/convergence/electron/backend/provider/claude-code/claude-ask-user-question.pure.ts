import type {
  InteractionChoiceOption,
  InteractionQuestion,
  InteractionRequest,
  InteractionResponse,
} from '../../session/conversation-item.types'

export interface ClaudeDialogToolUse {
  id: string
  name: string
  input: unknown
}

interface PendingClaudeQuestion {
  id: string
  questionText: string
  multiSelect: boolean
}

export interface PendingClaudeAskUserQuestion {
  toolUseId: string
  input: Record<string, unknown>
  questions: PendingClaudeQuestion[]
}

export interface PendingClaudeExitPlanMode {
  toolUseId: string
  input: Record<string, unknown>
}

export interface ClaudeAskUserQuestionRequest {
  kind: 'ask-user-question'
  prompt: string
  request: InteractionRequest
  pending: PendingClaudeAskUserQuestion
}

export interface ClaudeExitPlanModeRequest {
  kind: 'exit-plan-mode'
  prompt: string
  request: InteractionRequest
  pending: PendingClaudeExitPlanMode
}

export function buildClaudeAskUserQuestionRequest(
  toolUse: ClaudeDialogToolUse,
): ClaudeAskUserQuestionRequest | null {
  if (toolUse.name !== 'AskUserQuestion') return null
  if (!toolUse.input || typeof toolUse.input !== 'object') return null

  const input = toolUse.input as Record<string, unknown>
  const normalized = Array.isArray(input.questions)
    ? input.questions
        .map(normalizeClaudeAskUserQuestion)
        .filter(
          (question): question is InteractionQuestion => question !== null,
        )
    : []

  if (normalized.length === 0) return null

  const prompt = normalized.map((question) => question.question).join('\n')

  return {
    kind: 'ask-user-question',
    prompt,
    request: {
      kind: 'choice',
      questions: normalized,
    },
    pending: {
      toolUseId: toolUse.id,
      input,
      questions: normalized.map((question) => ({
        id: question.id,
        questionText: question.question,
        multiSelect: question.multiSelect,
      })),
    },
  }
}

export function buildClaudeAskUserQuestionUpdatedInput(
  pending: PendingClaudeAskUserQuestion,
  response: InteractionResponse | undefined,
  fallbackText: string,
): Record<string, unknown> {
  const answersByQuestionId = new Map(
    response?.kind === 'choice'
      ? response.answers.map((answer) => [answer.questionId, answer.values])
      : [],
  )

  const answers = Object.fromEntries(
    pending.questions.map((question) => {
      const values = answersByQuestionId.get(question.id) ?? [fallbackText]
      return [
        question.questionText,
        question.multiSelect ? values : (values[0] ?? ''),
      ]
    }),
  )

  return {
    ...pending.input,
    questions: pending.input.questions,
    answers,
  }
}

export function buildClaudeExitPlanModeRequest(
  toolUse: ClaudeDialogToolUse,
): ClaudeExitPlanModeRequest | null {
  if (toolUse.name !== 'ExitPlanMode') return null
  if (!toolUse.input || typeof toolUse.input !== 'object') return null

  const input = toolUse.input as Record<string, unknown>
  const plan =
    stringFromUnknown(input.plan) ??
    stringFromUnknown(input.planContent) ??
    stringFromUnknown(input.content) ??
    stringFromUnknown(input.markdown) ??
    stringFromUnknown(input.text) ??
    'Claude Code has prepared a plan for review.'
  const planPath =
    stringFromUnknown(input.planPath) ??
    stringFromUnknown(input.plan_file_path) ??
    stringFromUnknown(input.planFilePath) ??
    stringFromUnknown(input.filePath) ??
    stringFromUnknown(input.path) ??
    undefined
  const allowedPrompts = Array.isArray(input.allowedPrompts)
    ? input.allowedPrompts
        .map(stringFromUnknown)
        .filter((prompt): prompt is string => prompt !== null)
    : undefined

  return {
    kind: 'exit-plan-mode',
    prompt: plan,
    request: {
      kind: 'plan',
      plan,
      planPath,
      allowedPrompts:
        allowedPrompts && allowedPrompts.length > 0
          ? allowedPrompts
          : undefined,
    },
    pending: {
      toolUseId: toolUse.id,
      input,
    },
  }
}

function normalizeClaudeAskUserQuestion(
  value: unknown,
): InteractionQuestion | null {
  if (!value || typeof value !== 'object') return null
  const record = value as {
    id?: unknown
    question?: unknown
    prompt?: unknown
    header?: unknown
    options?: unknown
    multiSelect?: unknown
  }
  const question =
    stringFromUnknown(record.question) ??
    stringFromUnknown(record.prompt) ??
    stringFromUnknown(record.header)
  if (!question) return null

  const options = Array.isArray(record.options)
    ? record.options
        .map(normalizeClaudeAskUserQuestionOption)
        .filter((option): option is InteractionChoiceOption => option !== null)
    : []
  if (options.length === 0) return null

  return {
    id: stringFromUnknown(record.id) ?? question,
    question,
    header: stringFromUnknown(record.header) ?? question,
    options,
    multiSelect: record.multiSelect === true,
  }
}

function normalizeClaudeAskUserQuestionOption(
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

function stringFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
