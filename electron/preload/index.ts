import { contextBridge, ipcRenderer, nativeTheme } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  system: {
    getInfo: () => ({
      platform: process.platform,
      prefersReducedTransparency:
        nativeTheme?.prefersReducedTransparency ?? false,
    }),
  },
  project: {
    create: (input: { repositoryPath: string; name?: string }) =>
      ipcRenderer.invoke('project:create', input),
    getAll: () => ipcRenderer.invoke('project:getAll'),
    getById: (id: string) => ipcRenderer.invoke('project:getById', id),
    delete: (id: string) => ipcRenderer.invoke('project:delete', id),
    getActive: () => ipcRenderer.invoke('project:getActive'),
    setActive: (id: string) => ipcRenderer.invoke('project:setActive', id),
    updateSettings: (
      id: string,
      settings: {
        workspaceCreation: {
          startStrategy: 'base-branch' | 'current-head'
          baseBranchName: string | null
        }
      },
    ) => ipcRenderer.invoke('project:updateSettings', id, settings),
  },
  initiative: {
    list: () => ipcRenderer.invoke('initiative:list'),
    getById: (id: string) => ipcRenderer.invoke('initiative:getById', id),
    create: (input: unknown) => ipcRenderer.invoke('initiative:create', input),
    update: (id: string, input: unknown) =>
      ipcRenderer.invoke('initiative:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('initiative:delete', id),
    listAttempts: (initiativeId: string) =>
      ipcRenderer.invoke('initiative:listAttempts', initiativeId),
    listAttemptsForSession: (sessionId: string) =>
      ipcRenderer.invoke('initiative:listAttemptsForSession', sessionId),
    linkAttempt: (input: unknown) =>
      ipcRenderer.invoke('initiative:linkAttempt', input),
    updateAttempt: (id: string, input: unknown) =>
      ipcRenderer.invoke('initiative:updateAttempt', id, input),
    unlinkAttempt: (id: string) =>
      ipcRenderer.invoke('initiative:unlinkAttempt', id),
    setPrimaryAttempt: (initiativeId: string, attemptId: string) =>
      ipcRenderer.invoke(
        'initiative:setPrimaryAttempt',
        initiativeId,
        attemptId,
      ),
    listOutputs: (initiativeId: string) =>
      ipcRenderer.invoke('initiative:listOutputs', initiativeId),
    addOutput: (input: unknown) =>
      ipcRenderer.invoke('initiative:addOutput', input),
    updateOutput: (id: string, input: unknown) =>
      ipcRenderer.invoke('initiative:updateOutput', id, input),
    deleteOutput: (id: string) =>
      ipcRenderer.invoke('initiative:deleteOutput', id),
    synthesize: (initiativeId: string, requestId?: string) =>
      ipcRenderer.invoke('initiative:synthesize', initiativeId, requestId),
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  },
  workspace: {
    create: (input: {
      projectId: string
      branchName: string
      baseBranch?: string | null
    }) => ipcRenderer.invoke('workspace:create', input),
    getByProjectId: (projectId: string) =>
      ipcRenderer.invoke('workspace:getByProjectId', projectId),
    getAll: () => ipcRenderer.invoke('workspace:getAll'),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
  },
  git: {
    getBranches: (repoPath: string) =>
      ipcRenderer.invoke('git:getBranches', repoPath),
    getAllBranches: (repoPath: string) =>
      ipcRenderer.invoke('git:getAllBranches', repoPath),
    getCurrentBranch: (repoPath: string) =>
      ipcRenderer.invoke('git:getCurrentBranch', repoPath),
    getBranchOutputFacts: (repoPath: string) =>
      ipcRenderer.invoke('git:getBranchOutputFacts', repoPath),
    getStatus: (repoPath: string) =>
      ipcRenderer.invoke('git:getStatus', repoPath),
    getDiff: (repoPath: string, filePath?: string) =>
      ipcRenderer.invoke('git:getDiff', repoPath, filePath),
  },
  session: {
    create: (input: {
      projectId: string
      workspaceId: string | null
      providerId: string
      model: string | null
      effort: string | null
      name: string
    }) => ipcRenderer.invoke('session:create', input),
    getSummariesByProjectId: (projectId: string) =>
      ipcRenderer.invoke('session:getSummariesByProjectId', projectId),
    getAllSummaries: () => ipcRenderer.invoke('session:getAllSummaries'),
    getSummaryById: (id: string) =>
      ipcRenderer.invoke('session:getSummaryById', id),
    getConversation: (id: string) =>
      ipcRenderer.invoke('session:getConversation', id),
    archive: (id: string) => ipcRenderer.invoke('session:archive', id),
    unarchive: (id: string) => ipcRenderer.invoke('session:unarchive', id),
    delete: (id: string) => ipcRenderer.invoke('session:delete', id),
    start: (
      id: string,
      input: { text: string; attachmentIds?: string[] } | string,
    ) =>
      ipcRenderer.invoke(
        'session:start',
        id,
        typeof input === 'string' ? { text: input } : input,
      ),
    sendMessage: (
      id: string,
      input: { text: string; attachmentIds?: string[] } | string,
    ) =>
      ipcRenderer.invoke(
        'session:sendMessage',
        id,
        typeof input === 'string' ? { text: input } : input,
      ),
    approve: (id: string) => ipcRenderer.invoke('session:approve', id),
    deny: (id: string) => ipcRenderer.invoke('session:deny', id),
    stop: (id: string) => ipcRenderer.invoke('session:stop', id),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke('session:rename', id, name),
    regenerateName: (id: string) =>
      ipcRenderer.invoke('session:regenerateName', id),
    setPrimarySurface: (id: string, surface: 'conversation' | 'terminal') =>
      ipcRenderer.invoke('session:setPrimarySurface', id, surface),
    getNeedsYouDismissals: () =>
      ipcRenderer.invoke('session:getNeedsYouDismissals'),
    setNeedsYouDismissals: (dismissals: unknown) =>
      ipcRenderer.invoke('session:setNeedsYouDismissals', dismissals),
    getRecentIds: () => ipcRenderer.invoke('session:getRecentIds'),
    setRecentIds: (ids: string[]) =>
      ipcRenderer.invoke('session:setRecentIds', ids),
    onSessionSummaryUpdate: (callback: (summary: unknown) => void) => {
      const handler = (_event: unknown, summary: unknown) => callback(summary)
      ipcRenderer.on('session:summaryUpdated', handler)
      return () => {
        ipcRenderer.removeListener('session:summaryUpdated', handler)
      }
    },
    onSessionConversationPatched: (callback: (event: unknown) => void) => {
      const handler = (_event: unknown, event: unknown) => callback(event)
      ipcRenderer.on('session:conversationPatched', handler)
      return () => {
        ipcRenderer.removeListener('session:conversationPatched', handler)
      }
    },
    forkPreviewSummary: (parentId: string, requestId?: string) =>
      ipcRenderer.invoke('session:fork:previewSummary', parentId, requestId),
    forkFull: (input: unknown) =>
      ipcRenderer.invoke('session:fork:full', input),
    forkSummary: (input: unknown) =>
      ipcRenderer.invoke('session:fork:summary', input),
  },
  turns: {
    listForSession: (sessionId: string) =>
      ipcRenderer.invoke('turns:listForSession', sessionId),
    getFileChanges: (turnId: string) =>
      ipcRenderer.invoke('turns:getFileChanges', turnId),
    getFileDiff: (turnId: string, filePath: string) =>
      ipcRenderer.invoke('turns:getFileDiff', turnId, filePath),
    onTurnDelta: (callback: (payload: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on('turns:delta', handler)
      return () => {
        ipcRenderer.removeListener('turns:delta', handler)
      }
    },
  },
  provider: {
    getAll: () => ipcRenderer.invoke('provider:getAll'),
    getStatuses: () => ipcRenderer.invoke('provider:getStatuses'),
  },
  mcp: {
    listByProjectId: (projectId: string) =>
      ipcRenderer.invoke('mcp:listByProjectId', projectId),
  },
  skills: {
    listByProjectId: (projectId: string, options?: { forceReload?: boolean }) =>
      ipcRenderer.invoke('skills:listByProjectId', projectId, options),
  },
  feedback: {
    submit: (input: {
      kind: 'bug' | 'idea' | 'ui' | 'other'
      message: string
      contact?: string | null
      context?: {
        activeProjectId?: string | null
        activeProjectName?: string | null
        activeSessionId?: string | null
        appUrl?: string | null
      }
    }) => ipcRenderer.invoke('feedback:submit', input),
  },
  attachments: {
    ingestFiles: (
      sessionId: string,
      files: Array<{
        name: string
        bytes: Uint8Array | ArrayBuffer | number[]
        mimeType?: string
      }>,
    ) => ipcRenderer.invoke('attachments:ingestFiles', sessionId, files),
    ingestFromPaths: (sessionId: string, paths: string[]) =>
      ipcRenderer.invoke('attachments:ingestFromPaths', sessionId, paths),
    getForSession: (sessionId: string) =>
      ipcRenderer.invoke('attachments:getForSession', sessionId),
    getById: (id: string) => ipcRenderer.invoke('attachments:getById', id),
    readBytes: (id: string) => ipcRenderer.invoke('attachments:readBytes', id),
    delete: (id: string) => ipcRenderer.invoke('attachments:delete', id),
    showOpenDialog: () => ipcRenderer.invoke('attachments:showOpenDialog'),
  },
  appSettings: {
    get: () => ipcRenderer.invoke('appSettings:get'),
    set: (input: {
      defaultProviderId: string | null
      defaultModelId: string | null
      defaultEffortId: string | null
      namingModelByProvider: Record<string, string>
      extractionModelByProvider: Record<string, string>
      notifications?: unknown
    }) => ipcRenderer.invoke('appSettings:set', input),
    onUpdated: (callback: (settings: unknown) => void) => {
      const handler = (_event: unknown, settings: unknown) => callback(settings)
      ipcRenderer.on('appSettings:updated', handler)
      return () => {
        ipcRenderer.removeListener('appSettings:updated', handler)
      }
    },
  },
  notifications: {
    getPrefs: () => ipcRenderer.invoke('notifications:get-prefs'),
    setPrefs: (input: unknown) =>
      ipcRenderer.invoke('notifications:set-prefs', input),
    testFire: (severity: 'info' | 'critical') =>
      ipcRenderer.invoke('notifications:test-fire', severity),
    setActiveSession: (sessionId: string | null) =>
      ipcRenderer.invoke('notifications:set-active-session', sessionId),
    onPrefsUpdated: (callback: (prefs: unknown) => void) => {
      const handler = (_event: unknown, prefs: unknown) => callback(prefs)
      ipcRenderer.on('notifications:prefs-updated', handler)
      return () => {
        ipcRenderer.removeListener('notifications:prefs-updated', handler)
      }
    },
    onShowToast: (callback: (payload: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on('notifications:show-toast', handler)
      return () => {
        ipcRenderer.removeListener('notifications:show-toast', handler)
      }
    },
    onPlaySound: (callback: (payload: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on('notifications:play-sound', handler)
      return () => {
        ipcRenderer.removeListener('notifications:play-sound', handler)
      }
    },
    onFocusSession: (callback: (sessionId: string) => void) => {
      const handler = (_event: unknown, sessionId: string) =>
        callback(sessionId)
      ipcRenderer.on('notifications:focus-session', handler)
      return () => {
        ipcRenderer.removeListener('notifications:focus-session', handler)
      }
    },
    onClearUnread: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('notifications:clear-unread', handler)
      return () => {
        ipcRenderer.removeListener('notifications:clear-unread', handler)
      }
    },
  },
  taskProgress: {
    subscribe: (callback: (event: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on('task:progress', handler)
      return () => {
        ipcRenderer.removeListener('task:progress', handler)
      }
    },
  },
  updates: {
    getStatus: () => ipcRenderer.invoke('updates:get-status'),
    getAppVersion: () => ipcRenderer.invoke('updates:get-app-version'),
    getIsDev: () => ipcRenderer.invoke('updates:get-is-dev'),
    getPrefs: () => ipcRenderer.invoke('updates:get-prefs'),
    setPrefs: (input: unknown) =>
      ipcRenderer.invoke('updates:set-prefs', input),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    openReleaseNotes: () => ipcRenderer.invoke('updates:open-release-notes'),
    onStatusChanged: (callback: (status: unknown) => void) => {
      const handler = (_event: unknown, status: unknown) => callback(status)
      ipcRenderer.on('updates:status-changed', handler)
      return () => {
        ipcRenderer.removeListener('updates:status-changed', handler)
      }
    },
  },
  terminal: {
    create: (input: {
      sessionId: string
      cwd: string
      cols: number
      rows: number
    }) => ipcRenderer.invoke('terminal:create', input),
    attach: (id: string) => ipcRenderer.invoke('terminal:attach', id),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', id, cols, rows),
    dispose: (id: string) => ipcRenderer.invoke('terminal:dispose', id),
    getForegroundProcess: (id: string) =>
      ipcRenderer.invoke('terminal:getForegroundProcess', id),
    onData: (id: string, callback: (data: string) => void) => {
      const channel = `terminal:data:${id}`
      const handler = (_event: unknown, data: string) => callback(data)
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.removeListener(channel, handler)
      }
    },
    onExit: (
      id: string,
      callback: (payload: { exitCode: number; signal: number | null }) => void,
    ) => {
      const channel = `terminal:exit:${id}`
      const handler = (
        _event: unknown,
        payload: { exitCode: number; signal: number | null },
      ) => callback(payload)
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.removeListener(channel, handler)
      }
    },
  },
  terminalLayout: {
    get: (sessionId: string) =>
      ipcRenderer.invoke('terminalLayout:get', sessionId),
    save: (sessionId: string, tree: unknown) =>
      ipcRenderer.invoke('terminalLayout:save', sessionId, tree),
    clear: (sessionId: string) =>
      ipcRenderer.invoke('terminalLayout:clear', sessionId),
  },
})
