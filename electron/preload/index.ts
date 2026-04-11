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
})
