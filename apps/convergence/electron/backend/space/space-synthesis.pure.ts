import { parseSpaceArtifactKind, parseSpaceArtifactStatus } from './space.types'
import type {
  SpaceSynthesisArtifactSuggestion,
  SpaceSynthesisPromptInput,
  SpaceSynthesisResult,
  SpaceSynthesisValidationResult,
} from './space-synthesis.types'

export const INITIATIVE_SYNTHESIS_RETRY_SUFFIX =
  '\n\nYour previous artifact was not valid JSON matching the schema. Return only the JSON object.'

const TRANSCRIPT_CAP = 12000

function capText(value: string, cap: number): string {
  if (value.length <= cap) return value
  return value.slice(0, cap) + '...'
}

export function buildSpaceSynthesisPrompt(
  input: SpaceSynthesisPromptInput,
): string {
  const { space, attempts, artifacts } = input

  const stableState = [
    `Title: ${space.title}`,
    `Status: ${space.status}`,
    `Attention: ${space.attention}`,
    'Space brief:',
    space.brief.trim() || '(empty)',
  ].join('\n')

  const artifactLines =
    artifacts.length === 0
      ? '(none)'
      : artifacts
          .map(
            (artifact) =>
              `- ${artifact.kind} | ${artifact.status} | ${artifact.label}: ${artifact.value}` +
              (artifact.sourceSessionId
                ? ` | source session ${artifact.sourceSessionId}`
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
    'You synthesize a Space from linked agent Attempts.',
    '',
    'Return a SINGLE JSON object matching this schema:',
    '{',
    '  "brief": string,',
    '  "decisions": [string],',
    '  "open_questions": [string],',
    '  "next_action": string,',
    '  "artifacts": [',
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
    '- Treat the existing Space brief as stable user-curated state.',
    '- Improve it only when linked Attempts provide useful evidence.',
    '- Include only decisions, questions, and artifacts supported by the provided context.',
    '- Do not invent pull request URLs, branch names, file paths, or release names.',
    '- Artifact suggestions are proposals, not stable state.',
    '- Empty arrays are allowed. Empty next_action is allowed when unclear.',
    '- Return ONLY the JSON object. No markdown fences. No commentary.',
    '',
    'Stable Space state:',
    stableState,
    '',
    'Existing Artifacts:',
    artifactLines,
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

function parseArtifact(
  value: unknown,
): SpaceSynthesisArtifactSuggestion | null {
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
      ? parseSpaceArtifactStatus(obj.status)
      : 'planned'

  return {
    kind: parseSpaceArtifactKind(obj.kind),
    label: obj.label.trim(),
    value: obj.value.trim(),
    status,
    sourceSessionId:
      typeof obj.source_session_id === 'string'
        ? obj.source_session_id.trim() || null
        : null,
  }
}

export function parseAndValidateSpaceSynthesis(
  raw: string,
): SpaceSynthesisValidationResult {
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
  if (typeof obj.brief !== 'string') {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'brief invalid',
        field: 'brief',
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
  if (!Array.isArray(obj.artifacts)) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'artifacts invalid',
        field: 'artifacts',
      },
    }
  }

  const artifacts = obj.artifacts
    .map(parseArtifact)
    .filter(
      (artifact): artifact is SpaceSynthesisArtifactSuggestion =>
        artifact !== null &&
        artifact.label.length > 0 &&
        artifact.value.length > 0,
    )

  if (artifacts.length !== obj.artifacts.length) {
    return {
      ok: false,
      error: {
        kind: 'schema',
        message: 'artifacts contain invalid entries',
        field: 'artifacts',
      },
    }
  }

  const value: SpaceSynthesisResult = {
    brief: obj.brief.trim(),
    decisions: obj.decisions.map((decision) => decision.trim()).filter(Boolean),
    openQuestions: obj.open_questions
      .map((question) => question.trim())
      .filter(Boolean),
    nextAction: obj.next_action.trim(),
    artifacts,
  }

  return { ok: true, value }
}
