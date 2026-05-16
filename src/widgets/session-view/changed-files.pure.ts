import type { GitStatusEntry, ResolvedBaseBranch } from '@/entities/workspace'
import {
  getCodeReviewEmptyMessage,
  getCodeReviewHeaderLabel,
  selectCodeReviewFileAfterReload,
  type CodeReviewPanelMode,
} from '@/entities/code-review'

export type ChangedFilesReviewMode = CodeReviewPanelMode

export function getChangedFilesHeaderLabel(input: {
  mode: ChangedFilesReviewMode
  count: number
  base: ResolvedBaseBranch | null
}): string {
  return getCodeReviewHeaderLabel(input)
}

export function getChangedFilesEmptyMessage(input: {
  mode: ChangedFilesReviewMode
  loading: boolean
  base: ResolvedBaseBranch | null
  error: string | null
}): string {
  return getCodeReviewEmptyMessage(input)
}

export function selectChangedFileAfterReload(input: {
  current: string | null
  files: GitStatusEntry[]
}): string | null {
  return selectCodeReviewFileAfterReload(input)
}
