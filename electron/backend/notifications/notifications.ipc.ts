import { BrowserWindow, ipcMain } from 'electron'
import type { AppSettingsService } from '../app-settings/app-settings.service'
import type { NotificationsService } from './notifications.service'
import type { NotificationsStateService } from './notifications.state'
import type {
  NotificationEventKind,
  NotificationPrefs,
  NotificationSeverity,
} from './notifications.types'

export interface NotificationsIpcDeps {
  appSettings: AppSettingsService
  notifications: NotificationsService
  state: NotificationsStateService
}

export function registerNotificationsIpcHandlers(
  deps: NotificationsIpcDeps,
): void {
  ipcMain.handle('notifications:get-prefs', async () => {
    const settings = await deps.appSettings.getAppSettings()
    return settings.notifications
  })

  ipcMain.handle(
    'notifications:set-prefs',
    async (_event, input: NotificationPrefs) => {
      const current = await deps.appSettings.getAppSettings()
      const stored = await deps.appSettings.setAppSettings({
        defaultProviderId: current.defaultProviderId,
        defaultModelId: current.defaultModelId,
        defaultEffortId: current.defaultEffortId,
        namingModelByProvider: current.namingModelByProvider,
        extractionModelByProvider: current.extractionModelByProvider,
        notifications: input,
      })
      broadcastPrefs(stored.notifications)
      return stored.notifications
    },
  )

  ipcMain.handle(
    'notifications:test-fire',
    (_event, severity: NotificationSeverity) => {
      const kind: NotificationEventKind =
        severity === 'critical' ? 'agent.errored' : 'agent.finished'
      const synthetic = deps.notifications.buildEvent(kind, {
        id: 'notifications-test-fire',
        name: 'Test notification',
        projectId: 'notifications-test-fire',
      })
      deps.notifications.fire(synthetic, { bypass: true })
    },
  )

  ipcMain.handle(
    'notifications:set-active-session',
    (_event, sessionId: string | null) => {
      deps.state.setActiveSession(sessionId)
    },
  )
}

function broadcastPrefs(prefs: NotificationPrefs): void {
  broadcastNotificationsToRenderers('notifications:prefs-updated', prefs)
}

export function broadcastNotificationsToRenderers(
  channel: string,
  payload: unknown,
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
