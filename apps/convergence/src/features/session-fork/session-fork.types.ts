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
  | { status: 'error'; message: string }

export const MIN_TRANSCRIPT_ENTRIES_FOR_SUMMARY = 4
