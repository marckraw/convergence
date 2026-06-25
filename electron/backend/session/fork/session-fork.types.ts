import type { ReasoningEffort, ForkStrategy } from '../session.types'

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

/**
 * The model used to compact the parent transcript into the summary seed.
 * Optional at the IPC boundary; when omitted the parent provider's configured
 * extraction model is used.
 */
export interface ForkSummarizeWith {
  providerId: string
  modelId: string
  effort: ReasoningEffort | null
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
  /**
   * Attachment ids ingested against the fork draft, rebound to the child
   * session at start. Optional at the IPC boundary; defaults to none.
   */
  seedAttachmentIds?: string[]
}

export interface ForkFullInput extends ForkCommonInput {
  strategy: 'full'
}

export interface ForkSummaryInput extends ForkCommonInput {
  strategy: 'summary'
  seedMarkdown: string
}

export type ForkInput = ForkFullInput | ForkSummaryInput

export type SummaryValidationError =
  | { kind: 'parse'; message: string }
  | { kind: 'schema'; message: string; field?: string }

export type SummaryValidationResult =
  | { ok: true; value: ForkSummary }
  | { ok: false; error: SummaryValidationError }
