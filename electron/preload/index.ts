import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  project: {
    create: (input: { repositoryPath: string; name?: string }) =>
      ipcRenderer.invoke('project:create', input),
    getAll: () => ipcRenderer.invoke('project:getAll'),
    getById: (id: string) => ipcRenderer.invoke('project:getById', id),
    delete: (id: string) => ipcRenderer.invoke('project:delete', id),
    getActive: () => ipcRenderer.invoke('project:getActive'),
    setActive: (id: string) => ipcRenderer.invoke('project:setActive', id),
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
  },
  session: {
    create: (input: {
      projectId: string
      workspaceId: string | null
      providerId: string
      name: string
    }) => ipcRenderer.invoke('session:create', input),
    getByProjectId: (projectId: string) =>
      ipcRenderer.invoke('session:getByProjectId', projectId),
    getById: (id: string) => ipcRenderer.invoke('session:getById', id),
    delete: (id: string) => ipcRenderer.invoke('session:delete', id),
    start: (id: string, message: string) =>
      ipcRenderer.invoke('session:start', id, message),
    sendMessage: (id: string, text: string) =>
      ipcRenderer.invoke('session:sendMessage', id, text),
    approve: (id: string) => ipcRenderer.invoke('session:approve', id),
    deny: (id: string) => ipcRenderer.invoke('session:deny', id),
    stop: (id: string) => ipcRenderer.invoke('session:stop', id),
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
  },
})
