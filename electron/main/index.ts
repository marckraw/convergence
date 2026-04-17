import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
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
import { detectProviders } from '../backend/provider/detect'
import { McpService } from '../backend/mcp/mcp.service'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import { hydrateProcessPathFromShell } from '../backend/environment/shell-path.service'
import { registerIpcHandlers } from './ipc'
import { getWindowAppearanceOptions } from './window-effects.pure'
import { formatStartupFailure } from './startup-failure.pure'

function createWindow(): void {
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

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
  const db = getDatabase(dbPath)

  const gitService = new GitService()
  const projectService = new ProjectService(db)
  const stateService = new StateService(db)
  const workspaceService = new WorkspaceService(db, gitService, workspacesRoot)
  const providerRegistry = new ProviderRegistry()
  const sessionService = new SessionService(db, providerRegistry)

  projectService.setWorkspaceService(workspaceService)

  // Detect and register real providers
  const detected = await detectProviders()
  for (const p of detected) {
    if (p.id === 'claude-code') {
      providerRegistry.register(new ClaudeCodeProvider(p.binaryPath))
    } else if (p.id === 'codex') {
      providerRegistry.register(new CodexProvider(p.binaryPath))
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

  registerIpcHandlers(
    projectService,
    stateService,
    workspaceService,
    gitService,
    sessionService,
    providerRegistry,
    mcpService,
    appSettingsService,
  )

  const runtimeIconPath = resolveRuntimeIconPath()
  if (process.platform === 'darwin' && runtimeIconPath) {
    app.dock?.setIcon(runtimeIconPath)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
