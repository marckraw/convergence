import type { UpdatePrefs, UpdateStatus } from './updates.types'

export const updatesApi = {
  getStatus: (): Promise<UpdateStatus> =>
    window.electronAPI.updates.getStatus(),

  getAppVersion: (): Promise<string> =>
    window.electronAPI.updates.getAppVersion(),

  getIsDev: (): Promise<boolean> => window.electronAPI.updates.getIsDev(),

  getPrefs: (): Promise<UpdatePrefs> => window.electronAPI.updates.getPrefs(),

  setPrefs: (input: UpdatePrefs): Promise<UpdatePrefs> =>
    window.electronAPI.updates.setPrefs(input),

  check: (): Promise<UpdateStatus> => window.electronAPI.updates.check(),

  download: (): Promise<UpdateStatus> => window.electronAPI.updates.download(),

  install: (): Promise<UpdateStatus> => window.electronAPI.updates.install(),

  openReleaseNotes: (): Promise<boolean> =>
    window.electronAPI.updates.openReleaseNotes(),

  onStatusChanged: (callback: (status: UpdateStatus) => void): (() => void) =>
    window.electronAPI.updates.onStatusChanged(callback),
}
