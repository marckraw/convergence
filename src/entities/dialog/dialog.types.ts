export type DialogKind =
  | 'app-settings'
  | 'initiative-session-link'
  | 'initiative-workboard'
  | 'project-settings'
  | 'providers'
  | 'mcp-servers'
  | 'release-notes'
  | 'session-fork'
  | 'session-intent'
  | 'workspace-create'

export type DialogPayload =
  | { parentSessionId: string }
  | { sessionId: string }
  | { workspaceId: string | null }
  | null
