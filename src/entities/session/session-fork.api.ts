import type { SessionSummary } from './session.types'
import type {
  ForkFullInput,
  ForkSummary,
  ForkSummaryInput,
} from './session-fork.types'

export const sessionForkApi = {
  previewSummary: (
    parentId: string,
    requestId?: string,
  ): Promise<ForkSummary> =>
    window.electronAPI.session.forkPreviewSummary(
      parentId,
      requestId,
    ) as Promise<ForkSummary>,

  forkFull: (input: ForkFullInput): Promise<SessionSummary> =>
    window.electronAPI.session.forkFull(input) as Promise<SessionSummary>,

  forkSummary: (input: ForkSummaryInput): Promise<SessionSummary> =>
    window.electronAPI.session.forkSummary(input) as Promise<SessionSummary>,
}
