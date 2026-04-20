import type { ForkStrategy, ReasoningEffort, Session } from './session.types'

export type { ForkStrategy }

export type WorkspaceMode = 'reuse' | 'fork'

export interface ForkArtifacts {
  urls: string[]
  file_paths: string[]
  repos: string[]
  commands: string[]
  identifiers: string[]
}

export interface ForkDecision {
  text: string
  evidence: string
}

export interface ForkKeyFact {
  text: string
  evidence: string
}

export interface ForkSummary {
  topic: string
  decisions: ForkDecision[]
  open_questions: string[]
  key_facts: ForkKeyFact[]
  artifacts: ForkArtifacts
  next_steps: string[]
}

export interface ForkCommonInput {
  parentSessionId: string
  name: string
  providerId: string
  modelId: string
  effort: ReasoningEffort | null
  workspaceMode: WorkspaceMode
  workspaceBranchName: string | null
  additionalInstruction: string | null
}

export interface ForkFullInput extends ForkCommonInput {
  strategy: 'full'
}

export interface ForkSummaryInput extends ForkCommonInput {
  strategy: 'summary'
  seedMarkdown: string
}

export type ForkInput = ForkFullInput | ForkSummaryInput

export type ForkResult = Session
