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

/**
 * Where the New Space dialog was opened from, so it starts there and goes
 * back there (ruling 4, 2 Oct 2026: there is one way to create a Space, the
 * New Space dialog, and every inline trigger opens it prefilled).
 */
export interface NewSpacePrefill {
  /** The title it starts with, such as the session's name. */
  title?: string
  /** A session that joins the new Space as its seed attempt. */
  seedSessionId?: string
  /** The dialog it was opened from, opened again when it closes. */
  returnTo?: 'space-workboard' | 'space-session-link'
}

export type DialogPayload =
  | {
      appSettingsSection: AppSettingsDialogSection
      providerAccountProviderId?: 'claude-code' | 'codex'
    }
  | { newSpace: NewSpacePrefill }
  | { spaceId: string }
  | { parentSessionId: string }
  | { sessionId: string }
  | { workspaceId: string | null }
  | null
