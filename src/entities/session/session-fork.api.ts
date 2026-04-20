import type { Session } from './session.types'
import type {
  ForkFullInput,
  ForkSummary,
  ForkSummaryInput,
} from './session-fork.types'

export const sessionForkApi = {
  previewSummary: (parentId: string): Promise<ForkSummary> =>
    window.electronAPI.session.forkPreviewSummary(
      parentId,
    ) as Promise<ForkSummary>,

  forkFull: (input: ForkFullInput): Promise<Session> =>
    window.electronAPI.session.forkFull(input) as Promise<Session>,

  forkSummary: (input: ForkSummaryInput): Promise<Session> =>
    window.electronAPI.session.forkSummary(input) as Promise<Session>,
}
