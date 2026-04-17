export type WorkspaceStartStrategy = 'base-branch' | 'current-head'

export interface WorkspaceCreationSettings {
  startStrategy: WorkspaceStartStrategy
  baseBranchName: string | null
}

export interface ProjectSettings {
  workspaceCreation: WorkspaceCreationSettings
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  workspaceCreation: {
    startStrategy: 'base-branch',
    baseBranchName: null,
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

  return {
    workspaceCreation: {
      startStrategy,
      baseBranchName,
    },
  }
}
