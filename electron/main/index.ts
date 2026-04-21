import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { getDatabase } from '../backend/database/database'
import { ProjectService } from '../backend/project/project.service'
import { StateService } from '../backend/state/state.service'
import { WorkspaceService } from '../backend/workspace/workspace.service'
import { GitService } from '../backend/git/git.service'
import { SessionService } from '../backend/session/session.service'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { ClaudeCodeProvider } from '../backend/provider/claude-code/claude-code-provider'
import { CodexProvider } from '../backend/provider/codex/codex-provider'
import { PiProvider } from '../backend/provider/pi/pi-provider'
import { detectProviders } from '../backend/provider/detect'
import { McpService } from '../backend/mcp/mcp.service'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import { AttachmentsService } from '../backend/attachments/attachments.service'
import { SessionNamingService } from '../backend/session/naming/session-naming.service'
import { SessionForkService } from '../backend/session/fork/session-fork.service'
import { registerSessionForkIpcHandlers } from '../backend/session/fork/session-fork.ipc'
import { hydrateProcessPathFromShell } from '../backend/environment/shell-path.service'
import { TerminalService } from '../backend/terminal/terminal.service'
import {
  broadcastToRenderers,
  registerTerminalIpcHandlers,
} from '../backend/terminal/terminal.ipc'
import { createNodePtyFactory } from '../backend/terminal/pty-factory'
import { registerIpcHandlers } from './ipc'
import { shouldOpenInSystemBrowser } from './external-links.pure'
import { getWindowAppearanceOptions } from './window-effects.pure'
import {
  applyDockIcon,
  shouldQuitOnWindowAllClosed,
} from './app-chrome.service'
import { formatStartupFailure } from './startup-failure.pure'

function createWindow(onClose?: () => void): void {
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

  const dbPath = join(app.getPath('userData'), 'convergence.db')
  const workspacesRoot = join(app.getPath('userData'), 'workspaces')
  const attachmentsRoot = join(app.getPath('userData'), 'attachments')
  const db = getDatabase(dbPath)

  const gitService = new GitService()
  const projectService = new ProjectService(db)
  const stateService = new StateService(db)
  const workspaceService = new WorkspaceService(db, gitService, workspacesRoot)
  const providerRegistry = new ProviderRegistry()
  const sessionService = new SessionService(db, providerRegistry)
  const attachmentsService = new AttachmentsService(db, attachmentsRoot)
  sessionService.setAttachmentsService(attachmentsService)

  projectService.setWorkspaceService(workspaceService)

  try {
    const liveSessionIds = sessionService.getAll().map((s) => s.id)
    await attachmentsService.sweepOrphans(liveSessionIds)
  } catch (err) {
    console.warn('Attachment orphan sweep failed:', err)
  }

  // Detect and register real providers
  const detected = await detectProviders()
  for (const p of detected) {
    if (p.id === 'claude-code') {
      providerRegistry.register(new ClaudeCodeProvider(p.binaryPath))
    } else if (p.id === 'codex') {
      providerRegistry.register(new CodexProvider(p.binaryPath))
    } else if (p.id === 'pi') {
      providerRegistry.register(new PiProvider(p.binaryPath))
    }
  }

  console.log(
    `Providers: ${providerRegistry
      .getAll()
      .map((p) => p.name)
      .join(', ')}`,
  )

  const mcpService = new McpService(projectService, detected)

  const appSettingsService = new AppSettingsService(stateService, async () =>
    Promise.all(providerRegistry.getAll().map((p) => p.describe())),
  )

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
  registerSessionForkIpcHandlers(sessionForkService)

  registerIpcHandlers(
    projectService,
    stateService,
    workspaceService,
    gitService,
    sessionService,
    providerRegistry,
    mcpService,
    appSettingsService,
    attachmentsService,
  )

  const terminalService = new TerminalService(
    createNodePtyFactory(),
    broadcastToRenderers,
  )
  registerTerminalIpcHandlers(terminalService)

  app.on('before-quit', () => {
    terminalService.disposeAll()
  })

  const runtimeIconPath = resolveRuntimeIconPath()
  applyDockIcon(app, runtimeIconPath)

  const onWindowClosed = () => {
    terminalService.disposeAll()
  }

  createWindow(onWindowClosed)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(onWindowClosed)
    }
  })
}

function handleStartupFailure(err: unknown): void {
  console.error('Convergence startup failed:', err)
  const { title, body } = formatStartupFailure(err)
  dialog.showErrorBox(title, body)
  app.quit()
}

app.whenReady().then(startApp).catch(handleStartupFailure)

app.on('window-all-closed', () => {
  if (shouldQuitOnWindowAllClosed()) {
    app.quit()
  }
})
