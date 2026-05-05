import type {
  BaseBranchResolutionSource,
  ChangedFileEntry,
} from './changed-files.types'

export interface BaseBranchCandidate {
  branchName: string
  source: BaseBranchResolutionSource
}

export function normalizeBranchName(ref: string): string {
  return ref
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^origin\//, '')
}

export function selectBaseBranchCandidate(input: {
  pullRequestBaseBranch: string | null
  projectBaseBranch: string | null
  remoteDefaultBranch: string | null
  conventionalBranch: string | null
  currentBranch: string
}): BaseBranchCandidate {
  const pullRequestBaseBranch = normalizeNullableBranch(
    input.pullRequestBaseBranch,
  )
  if (pullRequestBaseBranch) {
    return {
      branchName: pullRequestBaseBranch,
      source: 'pull-request',
    }
  }

  const projectBaseBranch = normalizeNullableBranch(input.projectBaseBranch)
  if (projectBaseBranch) {
    return {
      branchName: projectBaseBranch,
      source: 'project-settings',
    }
  }

  const remoteDefaultBranch = normalizeNullableBranch(input.remoteDefaultBranch)
  if (remoteDefaultBranch) {
    return {
      branchName: remoteDefaultBranch,
      source: 'remote-default',
    }
  }

  const conventionalBranch = normalizeNullableBranch(input.conventionalBranch)
  if (conventionalBranch) {
    return {
      branchName: conventionalBranch,
      source: 'convention',
    }
  }

  return {
    branchName: normalizeBranchName(input.currentBranch),
    source: 'current-branch',
  }
}

export function parseNameStatusOutput(output: string): ChangedFileEntry[] {
  if (!output.trim()) return []

  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split('\t')
      const rawStatus = parts[0]?.trim()
      if (!rawStatus) return []

      const status = rawStatus.startsWith('R') ? 'R' : rawStatus.charAt(0)
      const file = status === 'R' ? parts[2] : parts[1]
      if (!file) return []

      return [{ status, file }]
    })
}

export function mergeChangedFileLists(
  trackedFiles: ChangedFileEntry[],
  untrackedFiles: string[],
): ChangedFileEntry[] {
  const files = new Map<string, ChangedFileEntry>()

  for (const entry of trackedFiles) {
    files.set(entry.file, entry)
  }

  for (const file of untrackedFiles) {
    if (!files.has(file)) {
      files.set(file, {
        status: '??',
        file,
      })
    }
  }

  return Array.from(files.values()).sort((left, right) =>
    left.file.localeCompare(right.file),
  )
}

function normalizeNullableBranch(branchName: string | null): string | null {
  if (!branchName?.trim()) return null
  return normalizeBranchName(branchName)
}
