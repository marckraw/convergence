export type InitiativeStatus =
  | 'exploring'
  | 'planned'
  | 'implementing'
  | 'reviewing'
  | 'ready-to-merge'
  | 'merged'
  | 'released'
  | 'parked'
  | 'discarded'

export type InitiativeAttention =
  | 'none'
  | 'needs-you'
  | 'needs-decision'
  | 'blocked'
  | 'stale'

export type InitiativeAttemptRole =
  | 'seed'
  | 'exploration'
  | 'implementation'
  | 'review'
  | 'hardening'
  | 'docs'

export type InitiativeOutputKind =
  | 'pull-request'
  | 'branch'
  | 'commit-range'
  | 'release'
  | 'spec'
  | 'documentation'
  | 'migration-note'
  | 'external-issue'
  | 'other'

export type InitiativeOutputStatus =
  | 'planned'
  | 'in-progress'
  | 'ready'
  | 'merged'
  | 'released'
  | 'abandoned'

export interface Initiative {
  id: string
  title: string
  status: InitiativeStatus
  attention: InitiativeAttention
  currentUnderstanding: string
  createdAt: string
  updatedAt: string
}

export interface InitiativeAttempt {
  id: string
  initiativeId: string
  sessionId: string
  role: InitiativeAttemptRole
  isPrimary: boolean
  createdAt: string
}

export interface InitiativeOutput {
  id: string
  initiativeId: string
  kind: InitiativeOutputKind
  label: string
  value: string
  sourceSessionId: string | null
  status: InitiativeOutputStatus
  createdAt: string
  updatedAt: string
}

export interface CreateInitiativeInput {
  title: string
  status?: InitiativeStatus
  attention?: InitiativeAttention
  currentUnderstanding?: string
}

export interface UpdateInitiativeInput {
  title?: string
  status?: InitiativeStatus
  attention?: InitiativeAttention
  currentUnderstanding?: string
}

export interface LinkInitiativeAttemptInput {
  initiativeId: string
  sessionId: string
  role?: InitiativeAttemptRole
  isPrimary?: boolean
}

export interface UpdateInitiativeAttemptInput {
  role?: InitiativeAttemptRole
}

export interface CreateInitiativeOutputInput {
  initiativeId: string
  kind: InitiativeOutputKind
  label: string
  value: string
  sourceSessionId?: string | null
  status?: InitiativeOutputStatus
}

export interface UpdateInitiativeOutputInput {
  kind?: InitiativeOutputKind
  label?: string
  value?: string
  sourceSessionId?: string | null
  status?: InitiativeOutputStatus
}

export interface InitiativeSynthesisOutputSuggestion {
  kind: InitiativeOutputKind
  label: string
  value: string
  sourceSessionId: string | null
  status: InitiativeOutputStatus
}

export interface InitiativeSynthesisResult {
  currentUnderstanding: string
  decisions: string[]
  openQuestions: string[]
  nextAction: string
  outputs: InitiativeSynthesisOutputSuggestion[]
}
