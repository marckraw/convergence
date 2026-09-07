import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  updateChannels,
  type UpdatesBridge,
  type UpdateState,
} from '../../shared/updates.types'

const updates: UpdatesBridge = {
  getState: () => ipcRenderer.invoke(updateChannels.get),
  check: () => ipcRenderer.invoke(updateChannels.check),
  download: () => ipcRenderer.invoke(updateChannels.download),
  install: () => ipcRenderer.invoke(updateChannels.install),
  subscribe(listener) {
    const receive = (_event: IpcRendererEvent, state: UpdateState) =>
      listener(state)
    ipcRenderer.on(updateChannels.state, receive)
    return () => {
      ipcRenderer.removeListener(updateChannels.state, receive)
    }
  },
}
contextBridge.exposeInMainWorld('backpackStudio', {
  platform: process.platform,
  updates,
})
