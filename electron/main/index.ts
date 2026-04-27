import {
  app,
  BrowserWindow,
  dialog,
  nativeTheme,
  Notification,
  shell,
} from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { getDatabase } from '../backend/database/database'
import { ProjectService } from '../backend/project/project.service'
import { InitiativeService } from '../backend/initiative/initiative.service'
import { InitiativeSynthesisService } from '../backend/initiative/initiative-synthesis.service'
import { StateService } from '../backend/state/state.service'
import { WorkspaceService } from '../backend/workspace/workspace.service'
import { GitService } from '../backend/git/git.service'
import { SessionService } from '../backend/session/session.service'
import { TurnCaptureService } from '../backend/session/turn/turn-capture.service'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { ClaudeCodeProvider } from '../backend/provider/claude-code/claude-code-provider'
import { CodexProvider } from '../backend/provider/codex/codex-provider'
import { PiProvider } from '../backend/provider/pi/pi-provider'
import { ShellProvider } from '../backend/provider/shell/shell-provider'
import { detectProviders } from '../backend/provider/detect'
import { McpService } from '../backend/mcp/mcp.service'
import { SkillsService } from '../backend/skills/skills.service'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import { AttachmentsService } from '../backend/attachments/attachments.service'
import { NotificationsService } from '../backend/notifications/notifications.service'
import { NotificationsStateService } from '../backend/notifications/notifications.state'
import { DockBadgeService } from '../backend/notifications/notifications.dock-badge'
import { DockBounceService } from '../backend/notifications/notifications.dock-bounce'
import { FlashFrameService } from '../backend/notifications/notifications.flash-frame'
import { SystemNotificationService } from '../backend/notifications/notifications.system'
import { SystemNotificationCoalescer } from '../backend/notifications/notifications.coalescer'
import { eventSeverity } from '../backend/notifications/notifications.policy.pure'
import {
  broadcastNotificationsToRenderers,
  registerNotificationsIpcHandlers,
} from '../backend/notifications/notifications.ipc'
import { UpdatesService } from '../backend/updates/updates.service'
import { UpdatesScheduler } from '../backend/updates/updates.scheduler'
import {
  broadcastUpdateStatus,
  registerUpdatesDevStubs,
  registerUpdatesIpc,
  registerUpdatesUnavailableStubs,
} from '../backend/updates/updates.ipc'
import { SessionNamingService } from '../backend/session/naming/session-naming.service'
import { SessionForkService } from '../backend/session/fork/session-fork.service'
import { registerSessionForkIpcHandlers } from '../backend/session/fork/session-fork.ipc'
import { loadEnvFile } from '../backend/environment/env-file.service'
import { hydrateProcessPathFromShell } from '../backend/environment/shell-path.service'
import { TerminalService } from '../backend/terminal/terminal.service'
import {
  broadcastToRenderers,
  registerTerminalIpcHandlers,
  registerTerminalLayoutIpcHandlers,
} from '../backend/terminal/terminal.ipc'
import { TerminalLayoutRepository } from '../backend/terminal/layout/terminal-layout.repository'
import { TerminalLayoutService } from '../backend/terminal/layout/terminal-layout.service'
import { TaskProgressService } from '../backend/task-progress/task-progress.service'
import { broadcastTaskProgress } from '../backend/task-progress/task-progress.ipc'
import { createNodePtyFactory } from '../backend/terminal/pty-factory'
import { FeedbackService } from '../backend/feedback/feedback.service'
import { registerFeedbackIpcHandlers } from '../backend/feedback/feedback.ipc'
import { registerIpcHandlers } from './ipc'
import { shouldOpenInSystemBrowser } from './external-links.pure'
import { resolveAutoUpdater } from './auto-updater-module.pure'
import { getWindowAppearanceOptions } from './window-effects.pure'
import { formatStartupFailure } from './startup-failure.pure'

function createWindow(
  onClose?: () => void,
  onCreate?: (window: BrowserWindow) => void,
): void {
  const runtimeIconPath = resolveRuntimeIconPath()

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Convergence',
    icon: runtimeIconPath,
    ...getWindowAppearanceOptions({
      platform: process.platform,
      prefersReducedTransparency: nativeTheme.prefersReducedTransparency,
    }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (onClose) {
    mainWindow.on('closed', onClose)
  }

  if (onCreate) {
    onCreate(mainWindow)
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      shouldOpenInSystemBrowser({
        currentUrl: mainWindow.webContents.getURL(),
        targetUrl: url,
      })
    ) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }

    return { action: 'allow' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (
      shouldOpenInSystemBrowser({
        currentUrl: mainWindow.webContents.getURL(),
        targetUrl: url,
      })
    ) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
}

function resolveRuntimeIconPath(): string | undefined {
  const candidates = [
    join(app.getAppPath(), 'build', 'icon.png'),
    join(process.cwd(), 'build', 'icon.png'),
  ]

  return candidates.find((candidate) => existsSync(candidate))
}

async function startApp(): Promise<void> {
  await hydrateProcessPathFromShell()

  let currentMainWindow: BrowserWindow | null = null

  const dbPath = join(app.getPath('userData'), 'convergence.db')
  const workspacesRoot = join(app.getPath('userData'), 'workspaces')
  const attachmentsRoot = join(app.getPath('userData'), 'attachments')
  loadEnvFile(join(app.getAppPath(), '.env'))
  loadEnvFile(join(process.cwd(), '.env'))
  const db = getDatabase(dbPath)

  const gitService = new GitService()
  const projectService = new ProjectService(db)
  const initiativeService = new InitiativeService(db)
  const stateService = new StateService(db)
  const workspaceService = new WorkspaceService(db, gitService, workspacesRoot)
  const providerRegistry = new ProviderRegistry()
  const taskProgressService = new TaskProgressService(broadcastTaskProgress)
  const sessionService = new SessionService(db, providerRegistry)
  const attachmentsService = new AttachmentsService(db, attachmentsRoot)
  const feedbackService = new FeedbackService({
    appVersion: app.getVersion(),
    platform: process.platform,
  })
  sessionService.setAttachmentsService(attachmentsService)
  const turnCaptureService = new TurnCaptureService(gitService, db)
  turnCaptureService.recoverRunningTurns()
  sessionService.setTurnCaptureService(turnCaptureService)

  projectService.setWorkspaceService(workspaceService)

  try {
    const liveSessionIds = sessionService.getAllSummaries().map((s) => s.id)
    await attachmentsService.sweepOrphans(liveSessionIds)
  } catch (err) {
    console.warn('Attachment orphan sweep failed:', err)
  }

  // Detect and register real providers
  const detected = await detectProviders()
  for (const p of detected) {
    if (p.id === 'claude-code') {
      providerRegistry.register(
        new ClaudeCodeProvider(p.binaryPath, taskProgressService),
      )
    } else if (p.id === 'codex') {
      providerRegistry.register(
        new CodexProvider(p.binaryPath, taskProgressService),
      )
    } else if (p.id === 'pi') {
      providerRegistry.register(
        new PiProvider(p.binaryPath, taskProgressService),
      )
    }
  }

  // Synthetic provider for terminal-primary sessions; always available
  // regardless of which conversational binaries are installed.
  providerRegistry.register(new ShellProvider())

  console.log(
    `Providers: ${providerRegistry
      .getAll()
      .map((p) => p.name)
      .join(', ')}`,
  )

  const mcpService = new McpService(projectService, detected)
  const skillsService = new SkillsService(projectService, detected)

  const appSettingsService = new AppSettingsService(stateService, async () =>
    Promise.all(providerRegistry.getAll().map((p) => p.describe())),
  )

  const notificationsState = new NotificationsStateService()
  const dockBadge = new DockBadgeService({
    setBadge: (text) => app.dock?.setBadge(text),
  })
  const dockBounce = new DockBounceService({
    bounce: (kind) => app.dock?.bounce(kind),
    cancelBounce: (id) => app.dock?.cancelBounce(id),
  })
  const flashFrame = new FlashFrameService({
    flashFrame: (flag) => currentMainWindow?.flashFrame(flag),
  })
  const systemNotifications = new SystemNotificationService({
    createNotification: ({ title, body, subtitle, sound }) =>
      new Notification({ title, body, subtitle, sound }),
    onClick: (event) => {
      if (currentMainWindow) {
        if (currentMainWindow.isMinimized()) currentMainWindow.restore()
        currentMainWindow.show()
        currentMainWindow.focus()
      }
      broadcastNotificationsToRenderers(
        'notifications:focus-session',
        event.sessionId,
      )
    },
  })
  const systemCoalescer = new SystemNotificationCoalescer({
    fire: (event, formatted) => systemNotifications.show(event, formatted),
  })
  notificationsState.setListeners({
    onFocusGained: () => {
      dockBadge.clear()
      dockBounce.cancelOnFocus()
      flashFrame.clearOnFocus()
      broadcastNotificationsToRenderers('notifications:clear-unread', null)
    },
  })
  const notificationsService = new NotificationsService({
    getPrefs: () => {
      // Reads the latest persisted prefs synchronously via the cached
      // state. AppSettingsService.getAppSettings is async, but the
      // notifications field always round-trips through the same JSON
      // blob, so we read the raw row here to avoid awaiting on the hot
      // attention-transition path. Falls back to defaults on any miss.
      return appSettingsService.getNotificationPrefsSync()
    },
    getWindowState: () => notificationsState.getState(),
    getProjectName: (projectId) =>
      projectService.getById(projectId)?.name ?? null,
    dispatch: ({ channel, event, formatted }) => {
      if (channel === 'toast' || channel === 'inline-pulse') {
        broadcastNotificationsToRenderers('notifications:show-toast', {
          channel,
          event,
          formatted,
        })
      } else if (channel === 'sound-soft' || channel === 'sound-alert') {
        broadcastNotificationsToRenderers('notifications:play-sound', {
          channel,
          event,
          formatted,
        })
      } else if (channel === 'dock-badge') {
        dockBadge.increment()
      } else if (channel === 'system-notification') {
        systemCoalescer.add(eventSeverity(event.kind), event, formatted)
      } else if (channel === 'dock-bounce-info') {
        dockBounce.bounceInformational()
      } else if (channel === 'dock-bounce-crit') {
        dockBounce.bounceCritical()
      } else if (channel === 'flash-frame') {
        flashFrame.flash()
      }
    },
  })
  sessionService.setAttentionObserver(notificationsService)

  registerNotificationsIpcHandlers({
    appSettings: appSettingsService,
    notifications: notificationsService,
    state: notificationsState,
  })

  let updatesService: UpdatesService | null = null
  let updatesScheduler: UpdatesScheduler | null = null
  if (app.isPackaged) {
    try {
      const updaterModule = await import('electron-updater')
      const autoUpdater = resolveAutoUpdater(updaterModule)
      if (!autoUpdater) {
        console.error(
          '[updates] auto-updates disabled: invalid electron-updater module shape',
          updaterModule,
        )
        registerUpdatesUnavailableStubs({
          appVersion: app.getVersion(),
          appSettings: appSettingsService,
        })
      } else {
        updatesService = new UpdatesService({
          autoUpdater,
          appVersion: app.getVersion(),
          broadcast: broadcastUpdateStatus,
          openExternal: (url) => shell.openExternal(url),
        })
        updatesScheduler = new UpdatesScheduler({
          service: updatesService,
          getPrefs: () => appSettingsService.getUpdatePrefsSync(),
        })
        registerUpdatesIpc({
          service: updatesService,
          appSettings: appSettingsService,
          onPrefsChanged: (prefs) => updatesScheduler?.onPrefsChanged(prefs),
        })
        updatesScheduler.start()
      }
    } catch (err) {
      console.error(
        '[updates] auto-updates disabled: failed to load electron-updater',
        err,
      )
      registerUpdatesUnavailableStubs({
        appVersion: app.getVersion(),
        appSettings: appSettingsService,
      })
    }
  } else {
    registerUpdatesDevStubs({
      appVersion: app.getVersion(),
      appSettings: appSettingsService,
    })
  }

  const namingService = new SessionNamingService({
    providers: providerRegistry,
    appSettings: appSettingsService,
  })
  sessionService.setNamer(namingService)

  const sessionForkService = new SessionForkService({
    sessions: sessionService,
    providers: providerRegistry,
    appSettings: appSettingsService,
    workspaces: workspaceService,
  })
  const initiativeSynthesisService = new InitiativeSynthesisService({
    initiatives: initiativeService,
    sessions: sessionService,
    providers: providerRegistry,
    appSettings: appSettingsService,
  })
  registerSessionForkIpcHandlers(sessionForkService)
  registerFeedbackIpcHandlers(feedbackService)

  registerIpcHandlers(
    projectService,
    initiativeService,
    stateService,
    workspaceService,
    gitService,
    sessionService,
    providerRegistry,
    mcpService,
    skillsService,
    appSettingsService,
    attachmentsService,
    turnCaptureService,
    initiativeSynthesisService,
    (prefs) => updatesScheduler?.onPrefsChanged(prefs),
  )

  const terminalService = new TerminalService(
    createNodePtyFactory(),
    broadcastToRenderers,
  )
  terminalService.setSessionLastTerminalExitObserver(
    ({ sessionId, exitCode }) =>
      sessionService.markShellSessionExited(sessionId, exitCode),
  )
  registerTerminalIpcHandlers(terminalService)

  const terminalLayoutService = new TerminalLayoutService({
    repository: new TerminalLayoutRepository(db),
  })
  registerTerminalLayoutIpcHandlers(terminalLayoutService)

  app.on('before-quit', () => {
    terminalService.disposeAll()
  })

  const runtimeIconPath = resolveRuntimeIconPath()
  if (process.platform === 'darwin' && runtimeIconPath) {
    app.dock?.setIcon(runtimeIconPath)
  }

  const onWindowClosed = () => {
    terminalService.disposeAll()
    currentMainWindow = null
  }

  const onWindowCreated = (window: BrowserWindow) => {
    currentMainWindow = window
    notificationsState.attach(window)
  }

  app.on('before-quit', () => {
    systemNotifications.dispose()
    systemCoalescer.dispose()
    updatesScheduler?.stop()
    updatesService?.dispose()
  })

  createWindow(onWindowClosed, onWindowCreated)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(onWindowClosed, onWindowCreated)
    }
  })
}

function handleStartupFailure(err: unknown): void {
  console.error('Convergence startup failed:', err)
  const { title, body } = formatStartupFailure(err)
  dialog.showErrorBox(title, body)
  app.quit()
}

// Required for `<audio>.play()` to fire without a user gesture in the
// renderer (notification chimes are dispatched from main-process events).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Windows forward-compat for system notifications; harmless on macOS.
app.setAppUserModelId('com.convergence.app')

app.whenReady().then(startApp).catch(handleStartupFailure)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
