export type {
  BaseBranchDiffSummary,
  BranchOutputFacts,
  ChangedFilesMode,
  GitStatusEntry,
  ResolvedBaseBranch,
  Workspace,
} from './workspace.types'
export { useWorkspaceStore } from './workspace.model'
export type { WorkspaceStore } from './workspace.model'
export { gitApi, workspaceApi } from './workspace.api'
