import { isAbsolute, relative, resolve } from 'path'

function isContainedPath(parentPath: string, candidatePath: string): boolean {
  const relativePath = relative(parentPath, candidatePath)
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  )
}

export function normalizeCloneRemoteUrl(remoteUrl: string): string {
  const normalized = remoteUrl.trim()
  if (!normalized) {
    throw new Error('Repository URL is required')
  }
  if (normalized.includes('\0') || normalized.startsWith('-')) {
    throw new Error('Repository URL is unsafe')
  }
  return normalized
}

export function deriveDefaultCloneDirectoryName(remoteUrl: string): string {
  const normalized = normalizeCloneRemoteUrl(remoteUrl).replace(/\/+$/, '')
  const lastSegment =
    normalized
      .split(/[:/\\]/)
      .filter(Boolean)
      .at(-1) ?? ''
  const withoutGitSuffix = lastSegment.replace(/\.git$/i, '')
  return normalizeCloneDirectoryName(withoutGitSuffix || 'repository')
}

export function normalizeCloneDirectoryName(directoryName: string): string {
  const normalized = directoryName.trim()
  if (!normalized) {
    throw new Error('Clone folder name is required')
  }
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('-') ||
    normalized.includes('\0') ||
    /[/\\]/.test(normalized)
  ) {
    throw new Error('Clone folder name is unsafe')
  }
  return normalized
}

export function resolveCloneDestination(
  parentDirectory: string,
  directoryName: string,
): string {
  const parentPath = resolve(parentDirectory)
  const destinationPath = resolve(
    parentPath,
    normalizeCloneDirectoryName(directoryName),
  )
  if (!isContainedPath(parentPath, destinationPath)) {
    throw new Error('Clone destination must stay inside the selected folder')
  }
  return destinationPath
}
