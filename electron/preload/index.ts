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
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  },
  workspace: {
    create: (input: { projectId: string; branchName: string }) =>
      ipcRenderer.invoke('workspace:create', input),
    getByProjectId: (projectId: string) =>
      ipcRenderer.invoke('workspace:getByProjectId', projectId),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
  },
  git: {
    getBranches: (repoPath: string) =>
      ipcRenderer.invoke('git:getBranches', repoPath),
    getCurrentBranch: (repoPath: string) =>
      ipcRenderer.invoke('git:getCurrentBranch', repoPath),
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
    getByProjectId: (projectId: string) =>
      ipcRenderer.invoke('session:getByProjectId', projectId),
    getAll: () => ipcRenderer.invoke('session:getAll'),
    getById: (id: string) => ipcRenderer.invoke('session:getById', id),
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
    getNeedsYouDismissals: () =>
      ipcRenderer.invoke('session:getNeedsYouDismissals'),
    setNeedsYouDismissals: (dismissals: unknown) =>
      ipcRenderer.invoke('session:setNeedsYouDismissals', dismissals),
    onSessionUpdate: (callback: (session: unknown) => void) => {
      const handler = (_event: unknown, session: unknown) => callback(session)
      ipcRenderer.on('session:updated', handler)
      return () => {
        ipcRenderer.removeListener('session:updated', handler)
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
    }) => ipcRenderer.invoke('appSettings:set', input),
    onUpdated: (callback: (settings: unknown) => void) => {
      const handler = (_event: unknown, settings: unknown) => callback(settings)
      ipcRenderer.on('appSettings:updated', handler)
      return () => {
        ipcRenderer.removeListener('appSettings:updated', handler)
      }
    },
  },
})
