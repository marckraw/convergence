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
})
