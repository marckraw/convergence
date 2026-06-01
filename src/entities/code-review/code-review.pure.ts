import type {
  CodeReviewBaseBranch,
  CodeReviewCacheIdentity,
  CodeReviewFileEntry,
  CodeReviewMode,
  CodeReviewPanelMode,
  CodeReviewTarget,
} from './code-review.types'

export function buildCodeReviewTargetId(target: CodeReviewTarget): string {
  return target.id
}

export function buildCodeReviewSummarySelectionKey(input: {
  target: CodeReviewTarget
  mode: CodeReviewMode
}): string {
  return `${buildCodeReviewTargetId(input.target)}:${input.mode}`
}

export function buildCodeReviewSummaryKey(input: {
  target: CodeReviewTarget
  mode: CodeReviewMode
  cacheIdentity: CodeReviewCacheIdentity
}): string {
  return [
    buildCodeReviewSummarySelectionKey(input),
    input.cacheIdentity.comparisonRef ?? 'none',
    input.cacheIdentity.comparisonPoint ?? 'none',
    input.cacheIdentity.workingTreeVersionToken,
  ].join(':')
}

export function buildCodeReviewFilePatchSelectionKey(input: {
  target: CodeReviewTarget
  mode: CodeReviewMode
  filePath: string
}): string {
  return `${buildCodeReviewSummarySelectionKey(input)}:${input.filePath}`
}

export function buildCodeReviewFilePatchKey(input: {
  target: CodeReviewTarget
  mode: CodeReviewMode
  filePath: string
  cacheIdentity: CodeReviewCacheIdentity
}): string {
  return `${buildCodeReviewSummaryKey(input)}:${input.filePath}`
}

export function getCodeReviewHeaderLabel(input: {
  mode: CodeReviewPanelMode
  count: number
  base: CodeReviewBaseBranch | null
  target?: CodeReviewTarget | null
}): string {
  if (input.mode === 'turns') return 'Turns'

  if (input.target && isRemotePullRequestTarget(input.target)) {
    return `Pull Request (${input.count})`
  }

  if (input.mode === 'base-branch') {
    return input.base
      ? `Against ${input.base.branchName} (${input.count})`
      : `Base Branch (${input.count})`
  }

  return `Changed Files (${input.count})`
}

export function getCodeReviewEmptyMessage(input: {
  mode: CodeReviewPanelMode
  loading: boolean
  base: CodeReviewBaseBranch | null
  error: string | null
  target?: CodeReviewTarget | null
}): string {
  if (input.target && isRemotePullRequestTarget(input.target)) {
    if (input.loading) return 'Loading pull request changes...'
    if (input.error) return input.error
    return 'No pull request changes detected'
  }

  if (input.loading) {
    return input.mode === 'base-branch'
      ? 'Loading base branch changes...'
      : 'Loading working tree...'
  }

  if (input.error) return input.error

  if (input.mode === 'base-branch') {
    return input.base
      ? `No changes against ${input.base.branchName} detected`
      : 'No changes against the base branch detected'
  }

  return 'No working tree changes detected'
}

export function selectCodeReviewFileAfterReload(input: {
  current: string | null
  files: CodeReviewFileEntry[]
}): string | null {
  if (input.files.some((file) => file.file === input.current)) {
    return input.current
  }

  return input.files[0]?.file ?? null
}

export function countCodeReviewFilesByStatus(
  files: CodeReviewFileEntry[],
): Record<string, number> {
  return files.reduce<Record<string, number>>((counts, file) => {
    counts[file.status] = (counts[file.status] ?? 0) + 1
    return counts
  }, {})
}

export function getCodeReviewTargetTitle(target: CodeReviewTarget): string {
  if (target.source === 'pull-request' && target.pullRequestLabel) {
    return target.pullRequestLabel
  }
  if (target.source === 'session' && target.sessionName) {
    return target.sessionName
  }
  if (target.source === 'workspace' && target.branchName) {
    return target.branchName
  }
  return target.projectName
}

export function getCodeReviewTargetSubtitle(target: CodeReviewTarget): string {
  const parts = [
    getCodeReviewTargetSourceLabel(target.source),
    target.projectName,
    target.branchName,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function getCodeReviewTargetSourceLabel(
  source: CodeReviewTarget['source'],
): string {
  switch (source) {
    case 'session':
      return 'Session'
    case 'workspace':
      return 'Workspace'
    case 'pull-request':
      return 'Pull Request'
    case 'project-repository':
      return 'Project Repository'
  }
}

export function isRemotePullRequestTarget(target: CodeReviewTarget): boolean {
  return target.source === 'pull-request' && !target.workspaceId
}
