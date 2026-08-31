import type {
  InteractionChoiceOption,
  InteractionQuestion,
  InteractionRequest,
  InteractionResponse,
} from '../../session/conversation-item.types'
import { compareSemver, extractSemver } from '../provider-status.pure'

export const CLAUDE_DEFERRED_TOOL_USE_MIN_VERSION = '2.1.89'

export interface ClaudeDeferredToolUse {
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

export type PendingClaudeDeferredToolUse =
  | {
      kind: 'ask-user-question'
      pending: PendingClaudeAskUserQuestion
    }
  | {
      kind: 'exit-plan-mode'
      pending: PendingClaudeExitPlanMode
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

export interface ClaudeDeferredToolHookResponse {
  permissionDecision: 'allow' | 'deny'
  permissionDecisionReason?: string
  updatedInput?: Record<string, unknown>
}

export function supportsClaudeDeferredToolUseVersion(
  versionOutput: string | null,
): boolean {
  const version = extractSemver(versionOutput)
  if (!version) return false
  return (
    (compareSemver(version, CLAUDE_DEFERRED_TOOL_USE_MIN_VERSION) ?? -1) >= 0
  )
}

export function buildClaudeAskUserQuestionHookSettings(): string {
  const hook = {
    type: 'command',
    command: 'node',
    args: ['-e', CLAUDE_DEFERRED_TOOL_HOOK_SCRIPT],
  }

  return JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: 'AskUserQuestion',
          hooks: [hook],
        },
        {
          matcher: 'ExitPlanMode',
          hooks: [hook],
        },
      ],
    },
  })
}

export function normalizeClaudeDeferredToolUse(
  value: unknown,
): ClaudeDeferredToolUse | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { id?: unknown; name?: unknown; input?: unknown }
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    record.input === null ||
    record.input === undefined
  ) {
    return null
  }

  return {
    id: record.id,
    name: record.name,
    input: record.input,
  }
}

export function buildClaudeAskUserQuestionRequest(
  toolUse: ClaudeDeferredToolUse,
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

export function buildClaudeAskUserQuestionHookResponse(
  pending: PendingClaudeAskUserQuestion,
  response: InteractionResponse | undefined,
  fallbackText: string,
): ClaudeDeferredToolHookResponse {
  return {
    permissionDecision: 'allow',
    updatedInput: buildClaudeAskUserQuestionUpdatedInput(
      pending,
      response,
      fallbackText,
    ),
  }
}

export function buildClaudeExitPlanModeRequest(
  toolUse: ClaudeDeferredToolUse,
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

export function buildClaudeExitPlanModeHookResponse(
  pending: PendingClaudeExitPlanMode,
  response: InteractionResponse | undefined,
  fallbackText: string,
): ClaudeDeferredToolHookResponse {
  if (response?.kind === 'plan' && response.decision === 'reject') {
    return {
      permissionDecision: 'deny',
      permissionDecisionReason:
        response.message?.trim() ||
        fallbackText.trim() ||
        'The user rejected the plan. Ask for clarification or provide a revised plan.',
    }
  }

  return {
    permissionDecision: 'allow',
    permissionDecisionReason: 'The user approved the plan in Convergence.',
    updatedInput: {
      ...pending.input,
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

const CLAUDE_DEFERRED_TOOL_HOOK_SCRIPT = `
const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  let event = {}
  try {
    event = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    event = {}
  }

  if (!['AskUserQuestion', 'ExitPlanMode'].includes(event.tool_name)) {
    process.exit(0)
  }

  const encoded = process.env.CONVERGENCE_CLAUDE_DEFERRED_TOOL_RESPONSE
  if (!encoded) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'defer'
      }
    }))
    return
  }

  try {
    const response = JSON.parse(encoded)
    if (response && response.permissionDecision === 'deny') {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: response.permissionDecisionReason || 'The user rejected this request.'
        }
      }))
      return
    }

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: response.permissionDecisionReason,
        updatedInput: response.updatedInput
      }
    }))
  } catch {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Convergence could not parse the deferred tool response.'
      }
    }))
  }
})
`
