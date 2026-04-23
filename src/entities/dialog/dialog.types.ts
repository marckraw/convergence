export type DialogKind =
  | 'app-settings'
  | 'project-settings'
  | 'providers'
  | 'mcp-servers'
  | 'release-notes'
  | 'session-fork'
  | 'session-intent'
  | 'workspace-create'

export type DialogPayload =
  | { parentSessionId: string }
  | { workspaceId: string | null }
  | null
