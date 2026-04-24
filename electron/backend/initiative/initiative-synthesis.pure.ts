import {
  parseInitiativeOutputKind,
  parseInitiativeOutputStatus,
} from './initiative.types'
import type {
  InitiativeSynthesisOutputSuggestion,
  InitiativeSynthesisPromptInput,
  InitiativeSynthesisResult,
  InitiativeSynthesisValidationResult,
} from './initiative-synthesis.types'

export const INITIATIVE_SYNTHESIS_RETRY_SUFFIX =
  '\n\nYour previous output was not valid JSON matching the schema. Return only the JSON object.'

const TRANSCRIPT_CAP = 12000

function capText(value: string, cap: number): string {
  if (value.length <= cap) return value
  return value.slice(0, cap) + '...'
}

export function buildInitiativeSynthesisPrompt(
  input: InitiativeSynthesisPromptInput,
): string {
  const { initiative, attempts, outputs } = input

  const stableState = [
    `Title: ${initiative.title}`,
    `Status: ${initiative.status}`,
    `Attention: ${initiative.attention}`,
    'Current understanding:',
    initiative.currentUnderstanding.trim() || '(empty)',
  ].join('\n')

  const outputLines =
    outputs.length === 0
      ? '(none)'
      : outputs
          .map(
            (output) =>
              `- ${output.kind} | ${output.status} | ${output.label}: ${output.value}` +
              (output.sourceSessionId
                ? ` | source session ${output.sourceSessionId}`
                : ''),
          )
          .join('\n')

  const attemptSections =
    attempts.length === 0
      ? '(none)'
      : attempts
          .map(({ attempt, session, transcript: rawTranscript }, index) => {
            const transcript = capText(rawTranscript, TRANSCRIPT_CAP)
            return [
              `Attempt ${index + 1}:`,
              `- attempt_id: ${attempt.id}`,
              `- session_id: ${session.id}`,
              `- role: ${attempt.role}`,
              `- primary: ${attempt.isPrimary ? 'yes' : 'no'}`,
              `- session_name: ${session.name}`,
              `- provider: ${session.providerId}`,
              `- status: ${session.status}`,
              `- attention: ${session.attention}`,
              `- working_directory: ${session.workingDirectory}`,
              'Transcript:',
              transcript || '(empty)',
            ].join('\n')
          })
          .join('\n\n')

  return [
    'You synthesize an Initiative from linked agent Attempts.',
    '',
    'Return a SINGLE JSON object matching this schema:',
    '{',
    '  "current_understanding": string,',
    '  "decisions": [string],',
    '  "open_questions": [string],',
    '  "next_action": string,',
    '  "outputs": [',
    '    {',
    '      "kind": "pull-request" | "branch" | "commit-range" | "release" | "spec" | "documentation" | "migration-note" | "external-issue" | "other",',
    '      "label": string,',
    '      "value": string,',
    '      "status": "planned" | "in-progress" | "ready" | "merged" | "released" | "abandoned",',
    '      "source_session_id": string | null',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Treat existing Current understanding as stable user-curated state.',
    '- Improve it only when linked Attempts provide useful evidence.',
    '- Include only decisions, questions, and outputs supported by the provided context.',
    '- Do not invent pull request URLs, branch names, file paths, or release names.',
    '- Output suggestions are proposals, not stable state.',
    '- Empty arrays are allowed. Empty next_action is allowed when unclear.',
    '- Output ONLY the JSON object. No markdown fences. No commentary.',
    '',
    'Stable Initiative state:',
    stableState,
    '',
    'Existing Outputs:',
    outputLines,
    '',
    'Linked Attempts:',
    attemptSections,
  ].join('\n')
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  if (fenced) return fenced[1].trim()
  return trimmed
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseOutput(
  value: unknown,
): InitiativeSynthesisOutputSuggestion | null {
  if (typeof value !== 'object' || value === null) return null
  const obj = value as Record<string, unknown>
  if (
    typeof obj.kind !== 'string' ||
    typeof obj.label !== 'string' ||
    typeof obj.value !== 'string'
  ) {
    return null
  }
  if (
    obj.source_session_id !== null &&
    obj.source_session_id !== undefined &&
    typeof obj.source_session_id !== 'string'
  ) {
    return null
  }
  const status =
    typeof obj.status === 'string'
      ? parseInitiativeOutputStatus(obj.status)
      : 'planned'

  return {
    kind: parseInitiativeOutputKind(obj.kind),
    label: obj.label.trim(),
    value: obj.value.trim(),
    status,
    sourceSessionId:
      typeof obj.source_session_id === 'string'
        ? obj.source_session_id.trim() || null
        : null,
  }
}

export function parseAndValidateInitiativeSynthesis(
  raw: string,
): InitiativeSynthesisValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonFences(raw))
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: 'parse',
        message: error instanceof Error ? error.message : 'invalid JSON',
      },
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      ok: false,
      error: { kind: 'schema', message: 'root is not object' },
    }
  }

  const obj = parsed as Record<string, unknown>
  if (typeof obj.current_understanding !== 'string') {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'current_understanding invalid',
        field: 'current_understanding',
      },
    }
  }
  if (!isStringArray(obj.decisions)) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'decisions invalid',
        field: 'decisions',
      },
    }
  }
  if (!isStringArray(obj.open_questions)) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'open_questions invalid',
        field: 'open_questions',
      },
    }
  }
  if (typeof obj.next_action !== 'string') {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'next_action invalid',
        field: 'next_action',
      },
    }
  }
  if (!Array.isArray(obj.outputs)) {
    return {
      ok: false,
      error: { kind: 'schema', message: 'outputs invalid', field: 'outputs' },
    }
  }

  const outputs = obj.outputs
    .map(parseOutput)
    .filter(
      (output): output is InitiativeSynthesisOutputSuggestion =>
        output !== null && output.label.length > 0 && output.value.length > 0,
    )

  if (outputs.length !== obj.outputs.length) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'outputs contain invalid entries',
        field: 'outputs',
      },
    }
  }

  const value: InitiativeSynthesisResult = {
    currentUnderstanding: obj.current_understanding.trim(),
    decisions: obj.decisions.map((decision) => decision.trim()).filter(Boolean),
    openQuestions: obj.open_questions
      .map((question) => question.trim())
      .filter(Boolean),
    nextAction: obj.next_action.trim(),
    outputs,
  }

  return { ok: true, value }
}
