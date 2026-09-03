export type DialogKind =
  | 'app-settings'
  | 'space-create'
  | 'space-session-link'
  | 'space-workboard'
  | 'project-create'
  | 'project-settings'
  | 'providers'
  | 'mcp-servers'
  | 'skills-browser'
  | 'prompt-library'
  | 'release-notes'
  | 'session-fork'
  | 'session-intent'
  | 'workspace-create'
  | 'lane-create'

export type AppSettingsDialogSection =
  | 'session-defaults'
  | 'session-naming'
  | 'session-forking'
  | 'credentials'
  | 'provider-accounts'
  | 'usage'
  | 'pi-models'
  | 'notifications'
  | 'updates'
  | 'insights'
  | 'shortcuts'
  | 'debug-logging'

export type DialogPayload =
  | { appSettingsSection: AppSettingsDialogSection }
  | { spaceId: string }
  | { parentSessionId: string }
  | { sessionId: string }
  | { workspaceId: string | null }
  | null
