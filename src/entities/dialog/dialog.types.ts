export type DialogKind =
  | 'app-settings'
  | 'space-create'
  | 'space-session-link'
  | 'space-workboard'
  | 'project-settings'
  | 'providers'
  | 'pull-request-review-start'
  | 'mcp-servers'
  | 'skills-browser'
  | 'prompt-library'
  | 'release-notes'
  | 'session-fork'
  | 'session-intent'
  | 'workspace-create'

export type AppSettingsDialogSection =
  | 'session-defaults'
  | 'session-naming'
  | 'session-forking'
  | 'credentials'
  | 'usage'
  | 'pi-models'
  | 'notifications'
  | 'updates'
  | 'insights'
  | 'debug-logging'

export type DialogPayload =
  | { appSettingsSection: AppSettingsDialogSection }
  | { spaceId: string }
  | { parentSessionId: string }
  | { sessionId: string }
  | { workspaceId: string | null }
  | null
