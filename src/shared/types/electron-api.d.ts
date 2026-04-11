interface ProjectData {
  id: string
  name: string
  repositoryPath: string
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface CreateProjectInput {
  repositoryPath: string
  name?: string
}

interface WorkspaceData {
  id: string
  projectId: string
  branchName: string
  path: string
  type: 'worktree'
  createdAt: string
}

interface CreateWorkspaceInput {
  projectId: string
  branchName: string
}

type SessionStatus = 'idle' | 'running' | 'completed' | 'failed'
type AttentionState =
  | 'none'
  | 'needs-input'
  | 'needs-approval'
  | 'finished'
  | 'failed'

type TranscriptEntry =
  | { type: 'user'; text: string; timestamp: string }
  | {
      type: 'assistant'
      text: string
      timestamp: string
      streaming?: boolean
    }
  | { type: 'tool-use'; tool: string; input: string; timestamp: string }
  | { type: 'tool-result'; result: string; timestamp: string }
  | {
      type: 'approval-request'
      description: string
      timestamp: string
    }
  | { type: 'input-request'; prompt: string; timestamp: string }
  | { type: 'system'; text: string; timestamp: string }

interface SessionData {
  id: string
  projectId: string
  workspaceId: string | null
  providerId: string
  name: string
  status: SessionStatus
  attention: AttentionState
  workingDirectory: string
  transcript: TranscriptEntry[]
  createdAt: string
  updatedAt: string
}

interface CreateSessionInput {
  projectId: string
  workspaceId: string | null
  providerId: string
  name: string
}

interface ProviderInfo {
  id: string
  name: string
}

interface ElectronAPI {
  project: {
    create: (input: CreateProjectInput) => Promise<ProjectData>
    getAll: () => Promise<ProjectData[]>
    getById: (id: string) => Promise<ProjectData | null>
    delete: (id: string) => Promise<void>
    getActive: () => Promise<ProjectData | null>
    setActive: (id: string) => Promise<void>
  }
  dialog: {
    selectDirectory: () => Promise<string | null>
  }
  workspace: {
    create: (input: CreateWorkspaceInput) => Promise<WorkspaceData>
    getByProjectId: (projectId: string) => Promise<WorkspaceData[]>
    delete: (id: string) => Promise<void>
  }
  git: {
    getBranches: (repoPath: string) => Promise<string[]>
    getCurrentBranch: (repoPath: string) => Promise<string>
  }
  session: {
    create: (input: CreateSessionInput) => Promise<SessionData>
    getByProjectId: (projectId: string) => Promise<SessionData[]>
    getById: (id: string) => Promise<SessionData | null>
    delete: (id: string) => Promise<void>
    start: (id: string, message: string) => Promise<void>
    sendMessage: (id: string, text: string) => Promise<void>
    approve: (id: string) => Promise<void>
    deny: (id: string) => Promise<void>
    stop: (id: string) => Promise<void>
    onSessionUpdate: (callback: (session: SessionData) => void) => () => void
  }
  provider: {
    getAll: () => Promise<ProviderInfo[]>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
