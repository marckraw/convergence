export type WorkspaceStartStrategy = 'base-branch' | 'current-head'

export interface WorkspaceCreationSettings {
  startStrategy: WorkspaceStartStrategy
  baseBranchName: string | null
}

export interface ProjectSettings {
  workspaceCreation: WorkspaceCreationSettings
  workspaceEnvFiles: WorkspaceEnvFileSettings
}

export type WorkspaceEnvFileCopyMode = 'copy-missing' | 'overwrite' | 'disabled'

export interface WorkspaceEnvFileSettings {
  copyMode: WorkspaceEnvFileCopyMode
  patterns: string[]
}

export const DEFAULT_WORKSPACE_ENV_FILE_PATTERNS = ['.env', '.env.*']

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  workspaceCreation: {
    startStrategy: 'base-branch',
    baseBranchName: null,
  },
  workspaceEnvFiles: {
    copyMode: 'copy-missing',
    patterns: DEFAULT_WORKSPACE_ENV_FILE_PATTERNS,
  },
}

export function normalizeProjectSettings(value: unknown): ProjectSettings {
  const candidate =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {}

  const workspaceCreationCandidate =
    typeof candidate.workspaceCreation === 'object' &&
    candidate.workspaceCreation !== null
      ? (candidate.workspaceCreation as Record<string, unknown>)
      : {}

  const startStrategy =
    workspaceCreationCandidate.startStrategy === 'current-head'
      ? 'current-head'
      : 'base-branch'

  const rawBaseBranchName = workspaceCreationCandidate.baseBranchName
  const baseBranchName =
    typeof rawBaseBranchName === 'string' && rawBaseBranchName.trim()
      ? rawBaseBranchName.trim()
      : null

  const workspaceEnvFilesCandidate =
    typeof candidate.workspaceEnvFiles === 'object' &&
    candidate.workspaceEnvFiles !== null
      ? (candidate.workspaceEnvFiles as Record<string, unknown>)
      : {}

  const copyMode =
    workspaceEnvFilesCandidate.copyMode === 'disabled' ||
    workspaceEnvFilesCandidate.copyMode === 'overwrite'
      ? workspaceEnvFilesCandidate.copyMode
      : 'copy-missing'

  const rawPatterns = Array.isArray(workspaceEnvFilesCandidate.patterns)
    ? workspaceEnvFilesCandidate.patterns
    : []
  const normalizedPatterns = Array.from(
    new Set(
      rawPatterns
        .filter((pattern): pattern is string => typeof pattern === 'string')
        .map((pattern) => pattern.trim())
        .filter(
          (pattern) =>
            pattern.length > 0 &&
            !pattern.includes('/') &&
            !pattern.includes('\\'),
        ),
    ),
  )

  return {
    workspaceCreation: {
      startStrategy,
      baseBranchName,
    },
    workspaceEnvFiles: {
      copyMode,
      patterns:
        normalizedPatterns.length > 0
          ? normalizedPatterns
          : DEFAULT_WORKSPACE_ENV_FILE_PATTERNS,
    },
  }
}
