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
    clone: (input: {
      remoteUrl: string
      parentDirectory: string
      directoryName?: string
      name?: string
    }) => ipcRenderer.invoke('project:clone', input),
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
        workspaceEnvFiles: {
          copyMode: 'copy-missing' | 'overwrite' | 'disabled'
          patterns: string[]
        }
      },
    ) => ipcRenderer.invoke('project:updateSettings', id, settings),
  },
  projectContext: {
    list: (projectId: string) =>
      ipcRenderer.invoke('projectContext:list', projectId),
    create: (input: unknown) =>
      ipcRenderer.invoke('projectContext:create', input),
    update: (id: string, patch: unknown) =>
      ipcRenderer.invoke('projectContext:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('projectContext:delete', id),
    attachToSession: (sessionId: string, itemIds: string[]) =>
      ipcRenderer.invoke('projectContext:attachToSession', sessionId, itemIds),
    listForSession: (sessionId: string) =>
      ipcRenderer.invoke('projectContext:listForSession', sessionId),
  },
  projectScripts: {
    list: (projectId: string) =>
      ipcRenderer.invoke('projectScripts:list', projectId),
    create: (input: unknown) =>
      ipcRenderer.invoke('projectScripts:create', input),
    update: (id: string, input: unknown) =>
      ipcRenderer.invoke('projectScripts:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('projectScripts:delete', id),
    listRuns: (projectId: string) =>
      ipcRenderer.invoke('projectScripts:listRuns', projectId),
    listActiveRuns: () => ipcRenderer.invoke('projectScripts:listActiveRuns'),
    getRun: (runId: string) =>
      ipcRenderer.invoke('projectScripts:getRun', runId),
    run: (scriptId: string, input?: unknown) =>
      ipcRenderer.invoke('projectScripts:run', scriptId, input),
    stop: (runId: string) => ipcRenderer.invoke('projectScripts:stop', runId),
    onRunUpdated: (callback: (run: unknown) => void) => {
      const handler = (_event: unknown, run: unknown) => callback(run)
      ipcRenderer.on('project-script-run:updated', handler)
      return () => {
        ipcRenderer.removeListener('project-script-run:updated', handler)
      }
    },
    onRunOutput: (callback: (output: unknown) => void) => {
      const handler = (_event: unknown, output: unknown) => callback(output)
      ipcRenderer.on('project-script-run:output', handler)
      return () => {
        ipcRenderer.removeListener('project-script-run:output', handler)
      }
    },
  },
  space: {
    list: () => ipcRenderer.invoke('space:list'),
    getById: (id: string) => ipcRenderer.invoke('space:getById', id),
    create: (input: unknown) => ipcRenderer.invoke('space:create', input),
    update: (id: string, input: unknown) =>
      ipcRenderer.invoke('space:update', id, input),
    archive: (id: string) => ipcRenderer.invoke('space:archive', id),
    unarchive: (id: string) => ipcRenderer.invoke('space:unarchive', id),
    delete: (id: string) => ipcRenderer.invoke('space:delete', id),
    listAttempts: (spaceId: string) =>
      ipcRenderer.invoke('space:listAttempts', spaceId),
    listAttemptsForSession: (sessionId: string) =>
      ipcRenderer.invoke('space:listAttemptsForSession', sessionId),
    linkAttempt: (input: unknown) =>
      ipcRenderer.invoke('space:linkAttempt', input),
    updateAttempt: (id: string, input: unknown) =>
      ipcRenderer.invoke('space:updateAttempt', id, input),
    unlinkAttempt: (id: string) =>
      ipcRenderer.invoke('space:unlinkAttempt', id),
    setPrimaryAttempt: (spaceId: string, attemptId: string) =>
      ipcRenderer.invoke('space:setPrimaryAttempt', spaceId, attemptId),
    listArtifacts: (spaceId: string) =>
      ipcRenderer.invoke('space:listArtifacts', spaceId),
    addArtifact: (input: unknown) =>
      ipcRenderer.invoke('space:addArtifact', input),
    addArtifactsFromPaths: (spaceId: string, paths: string[]) =>
      ipcRenderer.invoke('space:addArtifactsFromPaths', spaceId, paths),
    updateArtifact: (id: string, input: unknown) =>
      ipcRenderer.invoke('space:updateArtifact', id, input),
    deleteArtifact: (id: string) =>
      ipcRenderer.invoke('space:deleteArtifact', id),
    listSources: (spaceId: string) =>
      ipcRenderer.invoke('space:listSources', spaceId),
    addSourcesFromPaths: (spaceId: string, paths: string[]) =>
      ipcRenderer.invoke('space:addSourcesFromPaths', spaceId, paths),
    deleteSource: (id: string) => ipcRenderer.invoke('space:deleteSource', id),
    showSourceOpenDialog: () =>
      ipcRenderer.invoke('space:showSourceOpenDialog'),
    showArtifactOpenDialog: () =>
      ipcRenderer.invoke('space:showArtifactOpenDialog'),
    synthesize: (spaceId: string, requestId?: string) =>
      ipcRenderer.invoke('space:synthesize', spaceId, requestId),
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    selectCloneParentDirectory: () =>
      ipcRenderer.invoke('dialog:selectCloneParentDirectory'),
  },
  projectOpen: {
    listApps: () => ipcRenderer.invoke('projectOpen:listApps'),
    open: (input: { appId: string; path: string }) =>
      ipcRenderer.invoke('projectOpen:open', input),
  },
  lane: {
    create: (input: {
      rootProjectId: string
      laneName: string
      branchName: string
    }) => ipcRenderer.invoke('lane:create', input),
    list: (rootProjectId: string) =>
      ipcRenderer.invoke('lane:list', rootProjectId),
    reveal: (projectId: string) => ipcRenderer.invoke('lane:reveal', projectId),
    onProgress: (
      callback: (progress: {
        rootProjectId: string
        laneName: string
        phase: 'copying' | 'preparing-branch' | 'recording' | 'done'
      }) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: {
          rootProjectId: string
          laneName: string
          phase: 'copying' | 'preparing-branch' | 'recording' | 'done'
        },
      ) => callback(progress)
      ipcRenderer.on('lane:progress', handler)
      return () => {
        ipcRenderer.removeListener('lane:progress', handler)
      }
    },
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
    archive: (input: { id: string; removeWorktree?: boolean }) =>
      ipcRenderer.invoke('workspace:archive', input),
    unarchive: (id: string) => ipcRenderer.invoke('workspace:unarchive', id),
    removeWorktree: (id: string) =>
      ipcRenderer.invoke('workspace:removeWorktree', id),
    syncEnvFiles: (id: string) =>
      ipcRenderer.invoke('workspace:syncEnvFiles', id),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
  },
  pullRequest: {
    getByWorkspaceId: (workspaceId: string) =>
      ipcRenderer.invoke('pullRequest:getByWorkspaceId', workspaceId),
    listByProjectId: (projectId: string) =>
      ipcRenderer.invoke('pullRequest:listByProjectId', projectId),
    refreshForSession: (sessionId: string) =>
      ipcRenderer.invoke('pullRequest:refreshForSession', sessionId),
  },
  crew: {
    list: () => ipcRenderer.invoke('crew:list'),
    create: (input: unknown) => ipcRenderer.invoke('crew:create', input),
    update: (id: string, patch: unknown) =>
      ipcRenderer.invoke('crew:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('crew:delete', id),
    addMember: (crewId: string, sessionId: string) =>
      ipcRenderer.invoke('crew:addMember', crewId, sessionId),
    removeMember: (crewId: string, sessionId: string) =>
      ipcRenderer.invoke('crew:removeMember', crewId, sessionId),
    setMemberBatonName: (
      crewId: string,
      sessionId: string,
      batonName: string | null,
    ) =>
      ipcRenderer.invoke(
        'crew:setMemberBatonName',
        crewId,
        sessionId,
        batonName,
      ),
    onUpdated: (callback: (crews: unknown) => void) => {
      const handler = (_: unknown, crews: unknown) => callback(crews)
      ipcRenderer.on('crew:updated', handler)
      return () => {
        ipcRenderer.removeListener('crew:updated', handler)
      }
    },
  },
  relay: {
    list: () => ipcRenderer.invoke('relay:list'),
    create: (input: unknown) => ipcRenderer.invoke('relay:create', input),
    update: (id: string, patch: unknown) =>
      ipcRenderer.invoke('relay:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('relay:delete', id),
    arm: (id: string) => ipcRenderer.invoke('relay:arm', id),
    disarm: (id: string) => ipcRenderer.invoke('relay:disarm', id),
    listHops: (crewId: string, limit?: number, beforeHopId?: string | null) =>
      ipcRenderer.invoke('relayHops:list', crewId, limit, beforeHopId),
    clearHops: (crewId: string) =>
      ipcRenderer.invoke('relayHops:clear', crewId),
    onUpdated: (callback: (relays: unknown) => void) => {
      const handler = (_: unknown, relays: unknown) => callback(relays)
      ipcRenderer.on('relay:updated', handler)
      return () => {
        ipcRenderer.removeListener('relay:updated', handler)
      }
    },
    onHopAppended: (callback: (hop: unknown) => void) => {
      const handler = (_: unknown, hop: unknown) => callback(hop)
      ipcRenderer.on('relayHop:appended', handler)
      return () => {
        ipcRenderer.removeListener('relayHop:appended', handler)
      }
    },
    onHopsCleared: (callback: (crewId: string) => void) => {
      const handler = (_: unknown, crewId: string) => callback(crewId)
      ipcRenderer.on('relayHop:cleared', handler)
      return () => {
        ipcRenderer.removeListener('relayHop:cleared', handler)
      }
    },
  },
  crewHail: {
    listOpen: () => ipcRenderer.invoke('crewHails:listOpen'),
    acknowledge: (id: string) =>
      ipcRenderer.invoke('crewHails:acknowledge', id),
    acknowledgeCrew: (crewId: string) =>
      ipcRenderer.invoke('crewHails:acknowledgeCrew', crewId),
    onUpdated: (callback: (hails: unknown) => void) => {
      const handler = (_: unknown, hails: unknown) => callback(hails)
      ipcRenderer.on('crewHails:updated', handler)
      return () => {
        ipcRenderer.removeListener('crewHails:updated', handler)
      }
    },
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
    getCloneableRepositoryUrl: (repoPath: string) =>
      ipcRenderer.invoke('git:getCloneableRepositoryUrl', repoPath),
  },
  session: {
    create: (input: {
      contextKind?: 'project' | 'global'
      projectId?: string | null
      workspaceId?: string | null
      providerId: string
      model: string | null
      effort: string | null
      serviceTier?: string | null
      permissionConfig?: unknown
      name: string
      executionHost?: string
      // Where a remote session works, chosen in the strip. `unknown` because
      // the main process decodes it; this bridge only carries it (MAR-2689).
      workAddress?: unknown
    }) => ipcRenderer.invoke('session:create', input),
    getSummariesByProjectId: (projectId: string) =>
      ipcRenderer.invoke('session:getSummariesByProjectId', projectId),
    getAllSummaries: () => ipcRenderer.invoke('session:getAllSummaries'),
    getGlobalSummaries: () => ipcRenderer.invoke('session:getGlobalSummaries'),
    getSummaryById: (id: string) =>
      ipcRenderer.invoke('session:getSummaryById', id),
    getConversation: (id: string) =>
      ipcRenderer.invoke('session:getConversation', id),
    archive: (id: string) => ipcRenderer.invoke('session:archive', id),
    unarchive: (id: string) => ipcRenderer.invoke('session:unarchive', id),
    delete: (id: string) => ipcRenderer.invoke('session:delete', id),
    start: (
      id: string,
      input:
        | {
            text: string
            attachmentIds?: string[]
            skillSelections?: unknown[]
            deliveryMode?: string
          }
        | string,
    ) =>
      ipcRenderer.invoke(
        'session:start',
        id,
        typeof input === 'string' ? { text: input } : input,
      ),
    sendMessage: (
      id: string,
      input:
        | {
            text: string
            attachmentIds?: string[]
            skillSelections?: unknown[]
            deliveryMode?: string
            muteRelays?: boolean
          }
        | string,
    ) =>
      ipcRenderer.invoke(
        'session:sendMessage',
        id,
        typeof input === 'string' ? { text: input } : input,
      ),
    compactContext: (id: string, instructions?: string) =>
      ipcRenderer.invoke('session:compactContext', id, instructions),
    approve: (id: string, providerApprovalId?: string) =>
      ipcRenderer.invoke('session:approve', id, providerApprovalId),
    deny: (id: string, providerApprovalId?: string) =>
      ipcRenderer.invoke('session:deny', id, providerApprovalId),
    stop: (id: string) => ipcRenderer.invoke('session:stop', id),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke('session:rename', id, name),
    regenerateName: (id: string, requestId?: string) =>
      ipcRenderer.invoke('session:regenerateName', id, requestId),
    setPrimarySurface: (id: string, surface: 'conversation' | 'terminal') =>
      ipcRenderer.invoke('session:setPrimarySurface', id, surface),
    setModelSelection: (
      id: string,
      input: {
        providerId: string
        model: string | null
        effort: string | null
      },
    ) => ipcRenderer.invoke('session:setModelSelection', id, input),
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
    getQueuedInputs: (sessionId: string) =>
      ipcRenderer.invoke('session:getQueuedInputs', sessionId),
    cancelQueuedInput: (id: string) =>
      ipcRenderer.invoke('session:cancelQueuedInput', id),
    onSessionQueuedInputPatched: (callback: (event: unknown) => void) => {
      const handler = (_event: unknown, event: unknown) => callback(event)
      ipcRenderer.on('session:queuedInputPatched', handler)
      return () => {
        ipcRenderer.removeListener('session:queuedInputPatched', handler)
      }
    },
    forkPreviewSummary: (
      parentId: string,
      requestId?: string,
      summarizeWith?: unknown,
    ) =>
      ipcRenderer.invoke(
        'session:fork:previewSummary',
        parentId,
        requestId,
        summarizeWith,
      ),
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
    getFileDiff: (turnId: string, filePath: string, repoRoot?: string | null) =>
      ipcRenderer.invoke('turns:getFileDiff', turnId, filePath, repoRoot),
    onTurnDelta: (callback: (payload: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on('turns:delta', handler)
      return () => {
        ipcRenderer.removeListener('turns:delta', handler)
      }
    },
  },
  provider: {
    getAll: (executionHostId?: string | null) =>
      ipcRenderer.invoke('provider:getAll', executionHostId ?? null),
    getAllAvailable: () => ipcRenderer.invoke('provider:getAllAvailable'),
    getStatuses: () => ipcRenderer.invoke('provider:getStatuses'),
    getRuntimeInfo: () => ipcRenderer.invoke('provider:getRuntimeInfo'),
    update: (providerId: string) =>
      ipcRenderer.invoke('provider:update', providerId),
    onStatusesChanged: (callback: (statuses: unknown) => void) => {
      const handler = (_event: unknown, statuses: unknown) => callback(statuses)
      ipcRenderer.on('provider:statuses-changed', handler)
      return () => {
        ipcRenderer.removeListener('provider:statuses-changed', handler)
      }
    },
  },
  providerQuota: {
    list: (
      forceRefresh?: boolean,
      scope?: { executionHostId: string; providerAccountId: string | null },
    ) => ipcRenderer.invoke('providerQuota:list', forceRefresh, scope),
  },
  providerAccounts: {
    list: () => ipcRenderer.invoke('providerAccounts:list'),
    enrol: (input: { email: string; label?: string | null }) =>
      ipcRenderer.invoke('providerAccounts:enrol', input),
    reconnect: (accountId: string) =>
      ipcRenderer.invoke('providerAccounts:reconnect', accountId),
    remove: (accountId: string) =>
      ipcRenderer.invoke('providerAccounts:remove', accountId),
    setDefault: (accountId: string) =>
      ipcRenderer.invoke('providerAccounts:setDefault', accountId),
    rename: (accountId: string, label: string) =>
      ipcRenderer.invoke('providerAccounts:rename', accountId, label),
    sweepOrphans: () => ipcRenderer.invoke('providerAccounts:sweepOrphans'),
    scanSharedSettings: () =>
      ipcRenderer.invoke('providerAccounts:scanSharedSettings'),
    attest: () => ipcRenderer.invoke('providerAccounts:attest'),
    health: () => ipcRenderer.invoke('providerAccounts:health'),
    listConnectors: (accountId: string | null) =>
      ipcRenderer.invoke('providerAccounts:listConnectors', accountId),
    authorizeConnector: (input: {
      accountId: string | null
      serverName: string
    }) => ipcRenderer.invoke('providerAccounts:authorizeConnector', input),
  },
  mcp: {
    listByProjectId: (projectId: string) =>
      ipcRenderer.invoke('mcp:listByProjectId', projectId),
    listGlobal: () => ipcRenderer.invoke('mcp:listGlobal'),
  },
  skills: {
    listByProjectId: (projectId: string, options?: { forceReload?: boolean }) =>
      ipcRenderer.invoke('skills:listByProjectId', projectId, options),
    listGlobal: (options?: { forceReload?: boolean }) =>
      ipcRenderer.invoke('skills:listGlobal', options),
    listProviderIds: (projectId: string) =>
      ipcRenderer.invoke('skills:listProviderIds', projectId),
    listProvider: (
      projectId: string,
      providerId: string,
      options?: { forceReload?: boolean },
    ) =>
      ipcRenderer.invoke('skills:listProvider', projectId, providerId, options),
    readDetails: (input: unknown) =>
      ipcRenderer.invoke('skills:readDetails', input),
    reveal: (input: unknown) => ipcRenderer.invoke('skills:reveal', input),
    openPath: (input: unknown) => ipcRenderer.invoke('skills:openPath', input),
  },
  prompts: {
    listByProjectId: (projectId: string, options?: { forceReload?: boolean }) =>
      ipcRenderer.invoke('prompts:listByProjectId', projectId, options),
    listGlobal: (options?: { forceReload?: boolean }) =>
      ipcRenderer.invoke('prompts:listGlobal', options),
    readDetails: (input: unknown) =>
      ipcRenderer.invoke('prompts:readDetails', input),
    create: (input: unknown) => ipcRenderer.invoke('prompts:create', input),
    update: (input: unknown) => ipcRenderer.invoke('prompts:update', input),
    delete: (input: unknown) => ipcRenderer.invoke('prompts:delete', input),
  },
  feedback: {
    submit: (input: {
      title: string
      description: string
      priority: 'low' | 'medium' | 'high'
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
    ingestFromOpenDialog: (sessionId: string) =>
      ipcRenderer.invoke('attachments:ingestFromOpenDialog', sessionId),
    getForSession: (sessionId: string) =>
      ipcRenderer.invoke('attachments:getForSession', sessionId),
    getById: (id: string) => ipcRenderer.invoke('attachments:getById', id),
    readBytes: (id: string) => ipcRenderer.invoke('attachments:readBytes', id),
    delete: (id: string) => ipcRenderer.invoke('attachments:delete', id),
  },
  appSettings: {
    get: () => ipcRenderer.invoke('appSettings:get'),
    /**
     * Collects the daemon-credential cleanup debt (MAR-2642). Exposed to the
     * renderer because the settings dialog is where a removal was made, and
     * reopening it must be able to finish a cleanup the Keychain refused
     * without an app restart.
     */
    sweepExecutionHostCredentials: () =>
      ipcRenderer.invoke('appSettings:sweepExecutionHostCredentials'),
    set: (input: {
      defaultProviderId: string | null
      defaultModelId: string | null
      defaultEffortId: string | null
      namingModelByProvider: Record<string, string>
      extractionModelByProvider: Record<string, string>
      notifications?: unknown
      piModelVisibility?: unknown
      favoriteModels?: unknown
    }) => ipcRenderer.invoke('appSettings:set', input),
    onUpdated: (callback: (settings: unknown) => void) => {
      const handler = (_event: unknown, settings: unknown) => callback(settings)
      ipcRenderer.on('appSettings:updated', handler)
      return () => {
        ipcRenderer.removeListener('appSettings:updated', handler)
      }
    },
  },
  credentials: {
    openRouter: {
      getStatus: () => ipcRenderer.invoke('credentials:openrouter:getStatus'),
      setToken: (token: string) =>
        ipcRenderer.invoke('credentials:openrouter:setToken', { token }),
      deleteToken: () =>
        ipcRenderer.invoke('credentials:openrouter:deleteToken'),
    },
    executionHostDaemon: {
      // Every call names the Endpoint it acts on (MAR-2629). A token belongs
      // to one machine; a call that did not say which would authenticate as
      // whichever one the main process happened to default to.
      getStatus: (endpointId: string) =>
        ipcRenderer.invoke('credentials:executionHostDaemon:getStatus', {
          endpointId,
        }),
      setToken: (endpointId: string, token: string) =>
        ipcRenderer.invoke('credentials:executionHostDaemon:setToken', {
          endpointId,
          token,
        }),
      deleteToken: (endpointId: string) =>
        ipcRenderer.invoke('credentials:executionHostDaemon:deleteToken', {
          endpointId,
        }),
      // The one credential that names no Endpoint, and so is asked about
      // without one (MAR-2642).
      environmentOverride: () =>
        ipcRenderer.invoke(
          'credentials:executionHostDaemon:environmentOverride',
        ),
    },
  },
  executionHost: {
    testRemoteConnection: (endpointId: string) =>
      ipcRenderer.invoke('executionHost:testRemoteConnection', { endpointId }),
    sessionCountsByEndpoint: () =>
      ipcRenderer.invoke('executionHost:sessionCountsByEndpoint'),
    getSessionWorkspace: (sessionId: string) =>
      ipcRenderer.invoke('executionHost:getSessionWorkspace', sessionId),
    getProjects: (executionHostId?: string) =>
      ipcRenderer.invoke('executionHost:getProjects', executionHostId),
  },
  analytics: {
    getOverview: (rangePreset: '7d' | '30d' | '90d' | 'all') =>
      ipcRenderer.invoke('analytics:getOverview', rangePreset),
    generateWorkProfile: (input: {
      rangePreset: '7d' | '30d' | '90d' | 'all'
      providerId: string
      model: string | null
    }) => ipcRenderer.invoke('analytics:generateWorkProfile', input),
    deleteWorkProfileSnapshot: (id: string) =>
      ipcRenderer.invoke('analytics:deleteWorkProfileSnapshot', id),
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
  providerDebug: {
    subscribe: (sessionId: string, callback: (entry: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload)
      ipcRenderer.send('provider:debug:subscribe', sessionId)
      ipcRenderer.on('provider:debug:event', handler)
      return () => {
        ipcRenderer.removeListener('provider:debug:event', handler)
        ipcRenderer.send('provider:debug:unsubscribe', sessionId)
      }
    },
    list: (sessionId: string) =>
      ipcRenderer.invoke('provider:debug:list', sessionId),
    openFolder: () => ipcRenderer.invoke('provider:debug:openFolder'),
  },
  localModelTunnel: {
    getSnapshot: () => ipcRenderer.invoke('localModelTunnel:getSnapshot'),
    start: (profileId: string) =>
      ipcRenderer.invoke('localModelTunnel:start', profileId),
    stop: (profileId: string) =>
      ipcRenderer.invoke('localModelTunnel:stop', profileId),
    restart: (profileId: string) =>
      ipcRenderer.invoke('localModelTunnel:restart', profileId),
    createProfile: (input: unknown) =>
      ipcRenderer.invoke('localModelTunnel:createProfile', input),
    updateProfile: (profileId: string, input: unknown) =>
      ipcRenderer.invoke('localModelTunnel:updateProfile', profileId, input),
    deleteProfile: (profileId: string) =>
      ipcRenderer.invoke('localModelTunnel:deleteProfile', profileId),
    onChanged: (callback: (snapshot: unknown) => void) => {
      const handler = (_event: unknown, snapshot: unknown) => callback(snapshot)
      ipcRenderer.on('localModelTunnel:changed', handler)
      return () => {
        ipcRenderer.removeListener('localModelTunnel:changed', handler)
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
    onIdle: (callback: (payload: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on('terminal:idle', handler)
      return () => {
        ipcRenderer.removeListener('terminal:idle', handler)
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
