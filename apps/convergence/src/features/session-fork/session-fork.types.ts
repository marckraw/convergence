import type {
  ForkStrategy,
  ForkSummary,
  ReasoningEffort,
  WorkspaceMode,
} from '@/entities/session'

export interface ForkDraft {
  name: string
  strategy: ForkStrategy
  providerId: string
  modelId: string
  effortId: ReasoningEffort | ''
  workspaceMode: WorkspaceMode
  workspaceBranchName: string
  additionalInstruction: string
  seedMarkdown: string
}

export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; summary: ForkSummary }
  /** The summary failed; `message` is why, when the failure said (R10). */
  | { status: 'error'; message?: string }

/**
 * Creating the fork failed (DLG-31): the dialog says "Couldn’t create the
 * fork." and puts `reason`, when there is one, on the line under it.
 */
export interface ForkSubmitError {
  reason?: string
}

export const MIN_TRANSCRIPT_ENTRIES_FOR_SUMMARY = 4
