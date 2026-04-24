import type {
  Initiative,
  InitiativeAttempt,
  InitiativeOutputKind,
  InitiativeOutputStatus,
} from './initiative.types'
import type { SessionSummary } from '../session/session.types'

export interface InitiativeSynthesisOutputSuggestion {
  kind: InitiativeOutputKind
  label: string
  value: string
  status: InitiativeOutputStatus
  sourceSessionId: string | null
}

export interface InitiativeSynthesisResult {
  currentUnderstanding: string
  decisions: string[]
  openQuestions: string[]
  nextAction: string
  outputs: InitiativeSynthesisOutputSuggestion[]
}

export interface InitiativeSynthesisAttemptContext {
  attempt: InitiativeAttempt
  session: SessionSummary
  transcript: string
}

export interface InitiativeSynthesisPromptInput {
  initiative: Initiative
  attempts: InitiativeSynthesisAttemptContext[]
  outputs: Array<{
    kind: InitiativeOutputKind
    label: string
    value: string
    status: InitiativeOutputStatus
    sourceSessionId: string | null
  }>
}

export interface InitiativeSynthesisValidationError {
  kind: 'parse' | 'schema'
  message: string
  field?: string
}

export type InitiativeSynthesisValidationResult =
  | { ok: true; value: InitiativeSynthesisResult }
  | { ok: false; error: InitiativeSynthesisValidationError }
