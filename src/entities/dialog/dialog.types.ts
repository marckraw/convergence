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

export type AppSettingsDialogSection =
  | 'session-defaults'
  | 'workboard'
  | 'session-naming'
  | 'session-forking'
  | 'notifications'
  | 'updates'
  | 'insights'
  | 'debug-logging'

export type DialogPayload =
  | { appSettingsSection: AppSettingsDialogSection }
  | { initiativeId: string }
  | { parentSessionId: string }
  | { sessionId: string }
  | { workspaceId: string | null }
  | null
