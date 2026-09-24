/** Where a composer is aimed: the open project or the global chat, and the Session in it. */
export type ComposerSessionContext =
  | {
      kind: 'project'
      projectId: string
      workspaceId: string | null
      activeSessionId: string | null
    }
  | {
      kind: 'global'
      activeSessionId: string | null
    }
