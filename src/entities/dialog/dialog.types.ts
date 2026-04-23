export type DialogKind =
  | 'app-settings'
  | 'project-settings'
  | 'providers'
  | 'mcp-servers'
  | 'release-notes'
  | 'session-fork'
  | 'workspace-create'

export type DialogPayload = { parentSessionId: string } | null
