export type SpaceStatus =
  | 'exploring'
  | 'planned'
  | 'implementing'
  | 'reviewing'
  | 'ready-to-merge'
  | 'merged'
  | 'released'
  | 'parked'
  | 'discarded'

export type SpaceAttention =
  | 'none'
  | 'needs-you'
  | 'needs-decision'
  | 'blocked'
  | 'stale'

export type SpaceAttemptRole =
  | 'seed'
  | 'exploration'
  | 'implementation'
  | 'review'
  | 'hardening'
  | 'docs'

export type SpaceArtifactKind =
  | 'pull-request'
  | 'branch'
  | 'commit-range'
  | 'release'
  | 'spec'
  | 'documentation'
  | 'migration-note'
  | 'external-issue'
  | 'other'

export type SpaceArtifactStatus =
  | 'planned'
  | 'in-progress'
  | 'ready'
  | 'merged'
  | 'released'
  | 'abandoned'

export interface Space {
  id: string
  title: string
  status: SpaceStatus
  attention: SpaceAttention
  brief: string
  memory: string
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface SpaceAttempt {
  id: string
  spaceId: string
  sessionId: string
  role: SpaceAttemptRole
  isPrimary: boolean
  createdAt: string
}

export interface SpaceArtifact {
  id: string
  spaceId: string
  kind: SpaceArtifactKind
  label: string
  value: string
  sourceSessionId: string | null
  status: SpaceArtifactStatus
  createdAt: string
  updatedAt: string
}

export interface SpaceSource {
  id: string
  spaceId: string
  filename: string
  originalPath: string
  storagePath: string
  sizeBytes: number
  createdAt: string
}

export interface CreateSpaceInput {
  title: string
  status?: SpaceStatus
  attention?: SpaceAttention
  brief?: string
  memory?: string
}

export interface UpdateSpaceInput {
  title?: string
  status?: SpaceStatus
  attention?: SpaceAttention
  brief?: string
  memory?: string
}

export interface LinkSpaceAttemptInput {
  spaceId: string
  sessionId: string
  role?: SpaceAttemptRole
  isPrimary?: boolean
}

export interface UpdateSpaceAttemptInput {
  role?: SpaceAttemptRole
}

export interface CreateSpaceArtifactInput {
  spaceId: string
  kind: SpaceArtifactKind
  label: string
  value: string
  sourceSessionId?: string | null
  status?: SpaceArtifactStatus
}

export interface CreateSpaceArtifactsFromPathsInput {
  spaceId: string
  paths: string[]
}

export interface UpdateSpaceArtifactInput {
  kind?: SpaceArtifactKind
  label?: string
  value?: string
  sourceSessionId?: string | null
  status?: SpaceArtifactStatus
}

export interface SpaceSynthesisArtifactSuggestion {
  kind: SpaceArtifactKind
  label: string
  value: string
  sourceSessionId: string | null
  status: SpaceArtifactStatus
}

export interface SpaceSynthesisResult {
  brief: string
  decisions: string[]
  openQuestions: string[]
  nextAction: string
  artifacts: SpaceSynthesisArtifactSuggestion[]
}
