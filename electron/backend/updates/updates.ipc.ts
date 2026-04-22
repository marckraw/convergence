import { BrowserWindow, ipcMain } from 'electron'
import type { AppSettingsService } from '../app-settings/app-settings.service'
import { INITIAL_UPDATE_STATUS } from './updates.defaults'
import type { UpdatesService } from './updates.service'
import type { UpdatePrefs, UpdateStatus } from './updates.types'

export const UPDATES_STATUS_CHANGED = 'updates:status-changed'
const DEV_DISABLED_ERROR = 'auto-updates disabled in dev mode'
const UNAVAILABLE_DISABLED_ERROR = 'auto-updates unavailable in this build'

export interface UpdatesIpcDeps {
  service: UpdatesService
  appSettings: AppSettingsService
  onPrefsChanged?: (prefs: UpdatePrefs) => void
}

export function registerUpdatesIpc(deps: UpdatesIpcDeps): void {
  ipcMain.handle('updates:get-status', () => deps.service.getStatus())
  ipcMain.handle('updates:get-app-version', () => deps.service.getAppVersion())
  ipcMain.handle('updates:get-is-dev', () => false)
  ipcMain.handle('updates:check', () => deps.service.check('user'))
  ipcMain.handle('updates:download', () => deps.service.download())
  ipcMain.handle('updates:install', () => deps.service.install())
  ipcMain.handle('updates:open-release-notes', () =>
    deps.service.openReleaseNotes(),
  )
  ipcMain.handle('updates:get-prefs', async () => {
    const settings = await deps.appSettings.getAppSettings()
    return settings.updates
  })
  ipcMain.handle(
    'updates:set-prefs',
    async (_event, input: UpdatePrefs): Promise<UpdatePrefs> => {
      const current = await deps.appSettings.getAppSettings()
      const stored = await deps.appSettings.setAppSettings({
        defaultProviderId: current.defaultProviderId,
        defaultModelId: current.defaultModelId,
        defaultEffortId: current.defaultEffortId,
        namingModelByProvider: current.namingModelByProvider,
        extractionModelByProvider: current.extractionModelByProvider,
        notifications: current.notifications,
        onboarding: current.onboarding,
        updates: input,
      })
      deps.onPrefsChanged?.(stored.updates)
      return stored.updates
    },
  )
}

export interface UpdatesDevIpcDeps {
  appVersion: string
  appSettings: AppSettingsService
}

export function registerUpdatesDevStubs(deps: UpdatesDevIpcDeps): void {
  registerUpdatesDisabledStubs({
    ...deps,
    isDev: true,
    errorMessage: DEV_DISABLED_ERROR,
  })
}

export function registerUpdatesUnavailableStubs(deps: UpdatesDevIpcDeps): void {
  registerUpdatesDisabledStubs({
    ...deps,
    isDev: false,
    errorMessage: UNAVAILABLE_DISABLED_ERROR,
    status: {
      phase: 'error',
      message: UNAVAILABLE_DISABLED_ERROR,
      lastChecked: null,
    },
  })
}

interface UpdatesDisabledIpcDeps extends UpdatesDevIpcDeps {
  isDev: boolean
  errorMessage: string
  status?: UpdateStatus
}

function registerUpdatesDisabledStubs(deps: UpdatesDisabledIpcDeps): void {
  ipcMain.handle(
    'updates:get-status',
    () => deps.status ?? INITIAL_UPDATE_STATUS,
  )
  ipcMain.handle('updates:get-app-version', () => deps.appVersion)
  ipcMain.handle('updates:get-is-dev', () => deps.isDev)
  ipcMain.handle('updates:check', () => {
    throw new Error(deps.errorMessage)
  })
  ipcMain.handle('updates:download', () => {
    throw new Error(deps.errorMessage)
  })
  ipcMain.handle('updates:install', () => {
    throw new Error(deps.errorMessage)
  })
  ipcMain.handle('updates:open-release-notes', () => false)
  ipcMain.handle('updates:get-prefs', async () => {
    const settings = await deps.appSettings.getAppSettings()
    return settings.updates
  })
  ipcMain.handle(
    'updates:set-prefs',
    async (_event, input: UpdatePrefs): Promise<UpdatePrefs> => {
      const current = await deps.appSettings.getAppSettings()
      const stored = await deps.appSettings.setAppSettings({
        defaultProviderId: current.defaultProviderId,
        defaultModelId: current.defaultModelId,
        defaultEffortId: current.defaultEffortId,
        namingModelByProvider: current.namingModelByProvider,
        extractionModelByProvider: current.extractionModelByProvider,
        notifications: current.notifications,
        onboarding: current.onboarding,
        updates: input,
      })
      return stored.updates
    },
  )
}

export function broadcastUpdateStatus(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(UPDATES_STATUS_CHANGED, status)
    }
  }
}

export const UPDATES_DEV_DISABLED_ERROR = DEV_DISABLED_ERROR
export const UPDATES_UNAVAILABLE_ERROR = UNAVAILABLE_DISABLED_ERROR
