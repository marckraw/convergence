export type DialogKind =
  | 'app-settings'
  | 'initiative-session-link'
  | 'initiative-workboard'
  | 'project-settings'
  | 'providers'
  | 'mcp-servers'
  | 'skills-browser'
  | 'release-notes'
  | 'session-fork'
  | 'session-intent'
  | 'workspace-create'

export type DialogPayload =
  | { initiativeId: string }
  | { parentSessionId: string }
  | { sessionId: string }
  | { workspaceId: string | null }
  | null
