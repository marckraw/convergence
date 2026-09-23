import type {
  ReleaseSeat,
  ReleaseMergeInput,
} from '@/shared/types/release.types'
export const releaseApi = {
  plan: (input: ReleaseSeat) => window.electronAPI.release.plan(input),
  merge: (input: ReleaseMergeInput) => window.electronAPI.release.merge(input),
  acts: (input: ReleaseSeat) => window.electronAPI.release.acts(input),
}
