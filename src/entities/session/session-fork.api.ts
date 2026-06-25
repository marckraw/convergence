import type { SessionSummary } from './session.types'
import type {
  ForkFullInput,
  ForkSummarizeWith,
  ForkSummary,
  ForkSummaryInput,
} from './session-fork.types'

export const sessionForkApi = {
  previewSummary: (
    parentId: string,
    requestId?: string,
    summarizeWith?: ForkSummarizeWith,
  ): Promise<ForkSummary> =>
    window.electronAPI.session.forkPreviewSummary(
      parentId,
      requestId,
      summarizeWith,
    ) as Promise<ForkSummary>,

  forkFull: (input: ForkFullInput): Promise<SessionSummary> =>
    window.electronAPI.session.forkFull(input) as Promise<SessionSummary>,

  forkSummary: (input: ForkSummaryInput): Promise<SessionSummary> =>
    window.electronAPI.session.forkSummary(input) as Promise<SessionSummary>,
}
