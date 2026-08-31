import type {
  Space,
  SpaceAttempt,
  SpaceArtifactKind,
  SpaceArtifactStatus,
} from './space.types'
import type { SessionSummary } from '../session/session.types'

export interface SpaceSynthesisArtifactSuggestion {
  kind: SpaceArtifactKind
  label: string
  value: string
  status: SpaceArtifactStatus
  sourceSessionId: string | null
}

export interface SpaceSynthesisResult {
  brief: string
  decisions: string[]
  openQuestions: string[]
  nextAction: string
  artifacts: SpaceSynthesisArtifactSuggestion[]
}

export interface SpaceSynthesisAttemptContext {
  attempt: SpaceAttempt
  session: SessionSummary
  transcript: string
}

export interface SpaceSynthesisPromptInput {
  space: Space
  attempts: SpaceSynthesisAttemptContext[]
  artifacts: Array<{
    kind: SpaceArtifactKind
    label: string
    value: string
    status: SpaceArtifactStatus
    sourceSessionId: string | null
  }>
}

export interface SpaceSynthesisValidationError {
  kind: 'parse' | 'schema'
  message: string
  field?: string
}

export type SpaceSynthesisValidationResult =
  | { ok: true; value: SpaceSynthesisResult }
  | { ok: false; error: SpaceSynthesisValidationError }
