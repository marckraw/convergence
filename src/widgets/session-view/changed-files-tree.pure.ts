import type { GitStatus, GitStatusEntry } from '@pierre/trees'

export interface PierreChangedFileInput {
  status: string
  file: string
}

export interface PierreChangedFilesTreeInput {
  paths: string[]
  gitStatus: GitStatusEntry[]
  noteCountsByPath: Map<string, number>
}

export function buildPierreChangedFilesTreeInput(input: {
  files: PierreChangedFileInput[]
  noteCountsByPath?: ReadonlyMap<string, number> | Record<string, number>
}): PierreChangedFilesTreeInput {
  const paths: string[] = []
  const statusByPath = new Map<string, GitStatus>()
  const noteCountsByPath = new Map<string, number>()

  for (const changedFile of input.files) {
    const path = normalizeChangedFilePath(changedFile.file)
    if (!path) continue

    if (!statusByPath.has(path)) {
      paths.push(path)
    }
    statusByPath.set(path, mapGitStatusToPierre(changedFile.status))

    const noteCount = getNoteCount(input.noteCountsByPath, path)
    if (noteCount > 0) {
      noteCountsByPath.set(path, noteCount)
    }
  }

  return {
    paths,
    gitStatus: paths.map((path) => ({
      path,
      status: statusByPath.get(path) ?? 'modified',
    })),
    noteCountsByPath,
  }
}

export function mapGitStatusToPierre(status: string): GitStatus {
  const normalized = status.trim().toUpperCase()

  if (normalized.includes('?')) return 'untracked'
  if (normalized.includes('!')) return 'ignored'
  if (normalized.includes('R')) return 'renamed'
  if (normalized.includes('A') && !normalized.includes('D')) return 'added'
  if (normalized.includes('D') && !normalized.includes('A')) return 'deleted'

  return 'modified'
}

export function normalizeChangedFilePath(file: string): string {
  return file.trim().replaceAll('\\', '/').replace(/^\.\//, '')
}

function getNoteCount(
  noteCountsByPath:
    | ReadonlyMap<string, number>
    | Record<string, number>
    | undefined,
  path: string,
): number {
  if (!noteCountsByPath) return 0
  const maybeMap = noteCountsByPath as ReadonlyMap<string, number>
  if (typeof maybeMap.get === 'function') return maybeMap.get(path) ?? 0
  return (noteCountsByPath as Record<string, number>)[path] ?? 0
}
