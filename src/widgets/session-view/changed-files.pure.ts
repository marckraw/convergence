import type { GitStatusEntry, ResolvedBaseBranch } from '@/entities/workspace'

export type ChangedFilesReviewMode = 'working-tree' | 'base-branch' | 'turns'

export function getChangedFilesHeaderLabel(input: {
  mode: ChangedFilesReviewMode
  count: number
  base: ResolvedBaseBranch | null
}): string {
  if (input.mode === 'turns') {
    return 'Turns'
  }

  if (input.mode === 'base-branch') {
    return input.base
      ? `Against ${input.base.branchName} (${input.count})`
      : `Base Branch (${input.count})`
  }

  return `Changed Files (${input.count})`
}

export function getChangedFilesEmptyMessage(input: {
  mode: ChangedFilesReviewMode
  loading: boolean
  base: ResolvedBaseBranch | null
  error: string | null
}): string {
  if (input.loading) {
    return input.mode === 'base-branch'
      ? 'Loading base branch changes...'
      : 'Loading working tree...'
  }

  if (input.error) {
    return input.error
  }

  if (input.mode === 'base-branch') {
    return input.base
      ? `No changes against ${input.base.branchName} detected`
      : 'No changes against the base branch detected'
  }

  return 'No working tree changes detected'
}

export function selectChangedFileAfterReload(input: {
  current: string | null
  files: GitStatusEntry[]
}): string | null {
  if (input.files.some((file) => file.file === input.current)) {
    return input.current
  }

  return input.files[0]?.file ?? null
}
