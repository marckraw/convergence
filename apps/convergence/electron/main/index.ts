import { ErrandSpawner } from '../backend/relay/errand-spawner'
import { isTerminalSessionStatus } from '../backend/session/session.pure'
import {
  AutoDispatchService,
  type AutoDispatchGateway,
  type AutoDispatchRecipeGateway,
} from '../backend/tracker/auto-dispatch.service'
import { AutoDispatchPlanService } from '../backend/tracker/auto-dispatch-plan.service'
import { isLocalExecutionHost } from '../backend/execution-host-endpoint/execution-host-endpoint.pure'
import { CodexAccountHistoryService } from '../backend/provider-account/provider-account-codex-history.service'
import { CrewImportService } from '../backend/crew/crew-import.service'
import { registerCrewImportIpc } from '../backend/crew/crew-import.ipc'
import { CrewExportService } from '../backend/crew/crew-export.service'
import { registerCrewExportIpc } from '../backend/crew/crew-export.ipc'
import {
  app,
  BrowserWindow,
  dialog,
  nativeTheme,
  Notification,
  shell,
} from 'electron'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { resolveCodexAccountHandoffSource } from '../backend/provider-account/provider-account-resolution.pure'
import { join } from 'path'
import { getDatabase } from '../backend/database/database'
import { ProjectService } from '../backend/project/project.service'
import { ProjectScriptsService } from '../backend/project-scripts/project-scripts.service'
import { ProjectScriptsRunner } from '../backend/project-scripts/project-scripts.runner'
import {
  broadcastProjectScriptRun,
  registerProjectScriptsIpcHandlers,
} from '../backend/project-scripts/project-scripts.ipc'
import { SpaceService } from '../backend/space/space.service'
import { SpaceSynthesisService } from '../backend/space/space-synthesis.service'
import { ProjectContextService } from '../backend/project-context/project-context.service'
import { StateService } from '../backend/state/state.service'
import { WorkspaceService } from '../backend/workspace/workspace.service'
import { LaneService } from '../backend/lane/lane.service'
import { GitService } from '../backend/git/git.service'
import { PullRequestService } from '../backend/pull-request/pull-request.service'
import { SessionService } from '../backend/session/session.service'
import { SessionContextInjectionService } from '../backend/session/context-injection/session-context-injection.service'
import { TurnCaptureService } from '../backend/session/turn/turn-capture.service'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { LocalExecutionHost } from '../backend/provider/execution-host/local-execution-host'
import { ClaudeCodeProvider } from '../backend/provider/claude-code/claude-code-provider'
import { CodexProvider } from '../backend/provider/codex/codex-provider'
import { CodexServerHostRegistry } from '../backend/provider/codex/codex-server-host'
import { ClaudeAccountMaintenance } from '../backend/provider/claude-code/claude-account-maintenance.service'
import { ClaudeAccountHistoryService } from '../backend/provider-account/provider-account-claude-history.service'
import { CursorProvider } from '../backend/provider/cursor/cursor-provider'
import { PiProvider } from '../backend/provider/pi/pi-provider'
import { AntigravityProvider } from '../backend/provider/antigravity/antigravity-provider'
import { ShellProvider } from '../backend/provider/shell/shell-provider'
import { detectProviders } from '../backend/provider/detect'
import { updateProviderPackage } from '../backend/provider/provider-updater.service'
import { ProviderDebugService } from '../backend/provider-debug/provider-debug.service'
import {
  broadcastProviderDebug,
  registerProviderDebugIpcHandlers,
} from '../backend/provider-debug/provider-debug.ipc'
import { createJsonlWriter } from '../backend/provider-debug/provider-debug-jsonl'
import { LocalModelTunnelService } from '../backend/local-model-tunnel/local-model-tunnel.service'
import {
  broadcastLocalModelTunnelSnapshot,
  registerLocalModelTunnelIpcHandlers,
} from '../backend/local-model-tunnel/local-model-tunnel.ipc'
import { McpService } from '../backend/mcp/mcp.service'
import { SkillsService } from '../backend/skills/skills.service'
import { SkillCatalogRepository } from '../backend/skills/skill-catalog-cache.repository'
import { PromptsService } from '../backend/prompts/prompts.service'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import { ExecutionHostEndpointRepository } from '../backend/execution-host-endpoint/execution-host-endpoint.repository'
import { AnalyticsService } from '../backend/analytics/analytics.service'
import { CodexQuotaService } from '../backend/provider-quota/codex-quota.service'
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
import { ProviderAccountRepository } from '../backend/provider-account/provider-account.repository'
import { ProviderAccountEnrolmentService } from '../backend/provider-account/provider-account-enrolment.service'
import { ClaudeCredentialHealthService } from '../backend/provider-account/provider-account-credential-health.service'
import { ProviderAccountAttestationService } from '../backend/provider-account/provider-account-attestation.service'
import { ProviderAccountMcpService } from '../backend/provider-account/provider-account-mcp.service'
import { ProviderAccountLoginService } from '../backend/provider-account/provider-account-login.service'
import { createPtyCommandRunner } from '../backend/provider-account/provider-account-pty-runner'
import { registerProviderAccountIpcHandlers } from '../backend/provider-account/provider-account.ipc'
import {
  resolveAccountForTurn,
  resolveCodexAccountForTurn,
} from '../backend/provider-account/provider-account-resolution.pure'
import { loadEnvFile } from '../backend/environment/env-file.service'
import { hydrateProcessPathFromShell } from '../backend/environment/shell-path.service'
import { ExecutionHostDaemonCredentialsService } from '../backend/credentials/execution-host-daemon-credentials.service'
import { AppSettingsRemoteExecutionHostRegistry } from '../backend/provider/execution-host/remote-execution-host.registry'
import { readCloneableRepositoryUrl } from '../backend/git/git-origin'
import { OpenRouterCredentialsService } from '../backend/credentials/openrouter-credentials.service'
import { ProjectOpenService } from '../backend/project-open/project-open.service'
import { registerProjectOpenIpcHandlers } from '../backend/project-open/project-open.ipc'
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
import { CrewService } from '../backend/crew/crew.service'
import {
  broadcastCrews,
  registerCrewIpcHandlers,
} from '../backend/crew/crew.ipc'
import { ContextDrillService } from '../backend/context-drill/context-drill.service'
import { AutoDrillService } from '../backend/context-drill/auto-drill.service'
import { HarnessEvidenceService } from '../backend/session/harness-evidence.service'
import { APP_SETTINGS_KEY } from '../backend/app-settings/app-settings.constants'
import { parseAppSettings } from '../backend/app-settings/app-settings.pure'
import {
  broadcastContextDrillChange,
  registerContextDrillIpcHandlers,
} from '../backend/context-drill/context-drill.ipc'
import { RelayService } from '../backend/relay/relay.service'
import { RelayEngine } from '../backend/relay/relay.engine'
import { CrewHailService } from '../backend/relay/crew-hail.service'
import { startRelayStallClock } from './relay-stall-clock'
import { WorkLedgerService } from '../backend/work-ledger/work-ledger.service'
import {
  broadcastWorkLedger,
  registerWorkLedgerIpcHandlers,
} from '../backend/work-ledger/work-ledger.ipc'
import { TrackerCredentialsService } from '../backend/credentials/tracker-credentials.service'
import { TrackerWatcherService } from '../backend/tracker/tracker-watcher.service'
import { createLinearTrackerAdapter } from '../backend/tracker/linear-tracker.adapter'
import {
  broadcastTrackerOutside,
  broadcastTrackerRead,
  registerTrackerIpcHandlers,
} from '../backend/tracker/tracker.ipc'
import { isBudgetedOutcome } from '../backend/relay/relay.pure'
import {
  broadcastCrewHails,
  registerCrewHailIpcHandlers,
} from '../backend/relay/crew-hail.ipc'
import {
  broadcastRelayHop,
  broadcastRelayHopSettled,
  broadcastRelays,
  registerRelayIpcHandlers,
} from '../backend/relay/relay.ipc'
import { RunHistoryService } from '../backend/relay/run-history.service'
import { registerIpcHandlers } from './ipc'
import { getExternalNavigationAction } from './external-links.pure'
import { resolveAutoUpdater } from './auto-updater-module.pure'
import { getWindowAppearanceOptions } from './window-effects.pure'
import { formatStartupFailure } from './startup-failure.pure'
import { resolveUserDataPath } from './user-data-path.pure'

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
    const action = getExternalNavigationAction({
      currentUrl: mainWindow.webContents.getURL(),
      targetUrl: url,
    })

    if (action === 'open-external') {
      void shell.openExternal(url)
      return { action: 'deny' }
    }

    return { action }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const action = getExternalNavigationAction({
      currentUrl: mainWindow.webContents.getURL(),
      targetUrl: url,
    })

    if (action !== 'allow') {
      event.preventDefault()
    }

    if (action === 'open-external') {
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

  app.setPath(
    'userData',
    resolveUserDataPath({
      defaultPath: app.getPath('userData'),
      override: process.env.CONVERGENCE_USER_DATA_DIR,
    }),
  )

  const dbPath = join(app.getPath('userData'), 'convergence.db')
  const workspacesRoot = join(app.getPath('userData'), 'workspaces')
  const attachmentsRoot = join(app.getPath('userData'), 'attachments')
  const spacesRoot = join(app.getPath('userData'), 'spaces')
  const globalSessionsRoot = join(app.getPath('userData'), 'global-sessions')
  loadEnvFile(join(app.getAppPath(), '.env'))
  loadEnvFile(join(process.cwd(), '.env'))
  const db = getDatabase(dbPath)

  const gitService = new GitService()
  const projectService = new ProjectService(db)
  const projectScriptsService = new ProjectScriptsService(db)
  const spaceService = new SpaceService(db, spacesRoot)
  const projectContextService = new ProjectContextService(db)
  const sessionContextInjectionService = new SessionContextInjectionService(
    db,
    projectContextService,
  )
  const stateService = new StateService(db)
  const localModelTunnelService = new LocalModelTunnelService(
    stateService,
    broadcastLocalModelTunnelSnapshot,
  )
  registerLocalModelTunnelIpcHandlers(localModelTunnelService)
  void localModelTunnelService.startAutoStartProfiles()
  localModelTunnelService.startMonitoring()
  const workspaceService = new WorkspaceService(db, gitService, workspacesRoot)
  const pullRequestService = new PullRequestService(db, gitService)
  const crewService = new CrewService(db)
  const relayService = new RelayService(db)
  // The history read model reads both the ledger and the hail book, so it
  // owns neither and sits beside both (R12).
  const runHistoryService = new RunHistoryService(db)
  const providerRegistry = new ProviderRegistry()
  const openRouterCredentials = new OpenRouterCredentialsService()
  const taskProgressService = new TaskProgressService(broadcastTaskProgress)
  const executionHost = new LocalExecutionHost(providerRegistry)
  const sessionService = new SessionService(
    db,
    executionHost,
    globalSessionsRoot,
  )
  // SessionService has recovered stale sessions; clean legacy wires and seats
  // before the engine or renderer can read them (MAR-3254).
  relayService.removeOrphans()
  crewService.removeOrphanMemberships()
  const providerAccountRepository = new ProviderAccountRepository(db)

  const attachmentsService = new AttachmentsService(db, attachmentsRoot)
  const feedbackService = new FeedbackService({
    appVersion: app.getVersion(),
    platform: process.platform,
  })
  sessionService.setAttachmentsService(attachmentsService)
  sessionService.setSessionContextInjectionService(
    sessionContextInjectionService,
  )
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
  const debugLogsDirectory = join(app.getPath('userData'), 'debug-logs')
  const jsonlWriter = createJsonlWriter({ directory: debugLogsDirectory })
  const providerDebugService = new ProviderDebugService({
    broadcast: broadcastProviderDebug,
    jsonl: jsonlWriter,
    isLoggingEnabled: () =>
      appSettingsService.getDebugLoggingPrefsSync().enabled,
  })
  registerProviderDebugIpcHandlers({
    service: providerDebugService,
    logsDirectory: debugLogsDirectory,
  })
  sessionService.setSessionTerminatedListener((sessionId) => {
    providerDebugService.drop(sessionId)
  })
  try {
    const knownSessionIds = new Set(
      sessionService.getAll().map((session) => session.id),
    )
    jsonlWriter.cleanup(knownSessionIds)
  } catch {
    // Cleanup is best effort.
  }
  const debugSink = providerDebugService
  /**
   * The app's single pool of `codex app-server` processes: one per account,
   * shared by every Codex session, the quota reader, capability discovery and
   * skill listing (MAR-2823). Built at the composition root precisely so no
   * one of them can hold a private server.
   */
  const codexServerHosts = new CodexServerHostRegistry({
    appVersion: app.getVersion(),
  })
  // Constructed here so it can report RPC failures to the debug sink, and so
  // it reads each account's own CODEX_HOME rather than the ambient one (PA9).
  const codexQuotaService = new CodexQuotaService({
    debugSink,
    resolveAccount: (accountId) =>
      resolveCodexAccountForTurn({
        accountId,
        account: accountId ? providerAccountRepository.get(accountId) : null,
      }),
  })
  const ptyFactory = createNodePtyFactory()
  const providerAccountLoginService = new ProviderAccountLoginService({
    runner: createPtyCommandRunner({ ptyFactory }),
  })
  providerAccountLoginService.subscribe((attempt) =>
    broadcastToRenderers('providerAccounts:loginChanged', attempt),
  )
  const claudeAccountMaintenance = new ClaudeAccountMaintenance()
  const claudeCredentialHealth = new ClaudeCredentialHealthService()
  const providerAccountEnrolmentService = new ProviderAccountEnrolmentService({
    repository: providerAccountRepository,
    onAccountChanged: (id) => providerAccountAttestationService.invalidate(id),
    runLoginCommand: providerAccountLoginService.runLoginCommand,
    claudeMaintenance: {
      run: (account, work) => claudeAccountMaintenance.run(account.id, work),
    },
    codexMaintenance: {
      run: (account, work, retire) =>
        codexServerHosts.withStoppedServer(
          {
            executionHostId: account.executionHostId,
            account: { configDir: account.configDir },
          },
          work,
          { retire },
        ),
    },
  })
  const codexAccountHistory = new CodexAccountHistoryService()
  const providerAccountAttestationService =
    new ProviderAccountAttestationService({
      repository: providerAccountRepository,
      codexHistory: codexAccountHistory,
      claudeMaintenance: claudeAccountMaintenance,
      credentialHealth: claudeCredentialHealth,
      claudeHistory: new ClaudeAccountHistoryService(),
    })
  /**
   * Resolves a recorded account id to the directories that decide which
   * credential serves a turn. Reads at spawn time rather than caching, so an
   * account attestation disabled a moment ago stops receiving work.
   */
  const resolveClaudeAccountForTurn = (accountId: string | null | undefined) =>
    resolveAccountForTurn({
      accountId,
      account: accountId ? providerAccountRepository.get(accountId) : null,
    })
  /**
   * Names an account for the dirty-reconnect note (PA11). Reads at note time
   * rather than caching, so a renamed account is named correctly.
   */
  const describeClaudeAccount = (accountId: string | null) => {
    if (!accountId) return null
    const account = providerAccountRepository.get(accountId)
    return account ? (account.email ?? account.label) : null
  }
  /**
   * One PTY factory for the app: terminals and the connector-authorize
   * ceremony both need real terminals, and node-pty is a native module worth
   * loading exactly once, at the composition root.
   */
  const providerAccountMcpService = new ProviderAccountMcpService({
    repository: providerAccountRepository,
    accountMaintenance: claudeAccountMaintenance,
    codexMaintenance: {
      run: (account, work) =>
        codexServerHosts.withStoppedServer(
          {
            executionHostId: account.executionHostId,
            account: { configDir: account.configDir },
          },
          work,
        ),
    },
    runInteractiveCommand: createPtyCommandRunner({ ptyFactory }),
  })
  /** The same guard for Codex, whose account is a `CODEX_HOME` (PA9). */
  const resolveCodexAccountForSession = (
    accountId: string | null | undefined,
  ) =>
    resolveCodexAccountForTurn({
      accountId,
      account: accountId ? providerAccountRepository.get(accountId) : null,
    })
  async function refreshDetectedProviders() {
    const nextDetected = await detectProviders()
    claudeCredentialHealth.setBinaryPath(
      nextDetected.find((provider) => provider.id === 'claude-code')
        ?.binaryPath ?? null,
    )

    for (const p of nextDetected) {
      if (p.id === 'claude-code') {
        providerRegistry.register(
          new ClaudeCodeProvider(
            p.binaryPath,
            taskProgressService,
            debugSink,
            p.version,
            resolveClaudeAccountForTurn,
            describeClaudeAccount,
            true,
            () => appSettingsService.getClaudeResidentIdleMinutesSync(),
            claudeAccountMaintenance,
          ),
        )
        providerAccountEnrolmentService.setBinaryPath(p.id, p.binaryPath)
        providerAccountMcpService.setBinaryPath(p.binaryPath)
        // A version change is attestation's most important trigger: a release
        // that renames or ignores the undocumented credential variable arrives
        // exactly there.
        providerAccountAttestationService.setClaudeVersion(p.version ?? null)
      } else if (p.id === 'codex') {
        providerRegistry.register(
          new CodexProvider(
            codexServerHosts,
            taskProgressService,
            debugSink,
            resolveCodexAccountForSession,
            codexAccountHistory,
            (accountId) =>
              resolveCodexAccountHandoffSource({
                accountId,
                account: providerAccountRepository.get(accountId),
                homeDir: homedir(),
              }),
          ),
        )
        // The version gates the resident server: an older codex-cli is refused
        // out loud rather than served by a path that no longer exists.
        codexServerHosts.setBinary(p.binaryPath, p.version ?? null)
        providerAccountMcpService.setCodexBinaryPath(p.binaryPath)
        codexQuotaService.setServerHosts(codexServerHosts)
        providerAccountEnrolmentService.setBinaryPath(p.id, p.binaryPath)
      } else if (p.id === 'cursor') {
        providerRegistry.register(
          new CursorProvider(p.binaryPath, debugSink, undefined, {
            appVersion: app.getVersion(),
          }),
        )
      } else if (p.id === 'pi') {
        providerRegistry.register(
          new PiProvider(
            p.binaryPath,
            taskProgressService,
            debugSink,
            (env) => openRouterCredentials.withOpenRouterEnv(env),
            p.version,
          ),
        )
      } else if (p.id === 'antigravity') {
        providerRegistry.register(
          new AntigravityProvider(p.binaryPath, taskProgressService, debugSink),
        )
      }
    }

    return nextDetected
  }
  let detected = await refreshDetectedProviders()

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
  const skillsService = new SkillsService(projectService, detected, {
    cacheRepository: new SkillCatalogRepository(db),
    appVersion: app.getVersion(),
    codexServerHosts,
  })
  const promptsService = new PromptsService(db, projectService)
  const projectScriptsRunner = new ProjectScriptsRunner({
    service: projectScriptsService,
    broadcast: broadcastProjectScriptRun,
  })
  registerProjectScriptsIpcHandlers(projectScriptsService, projectScriptsRunner)

  // Built before the settings service because that service destroys an
  // Endpoint's token as part of the save that removes the Endpoint (MAR-2642).
  const executionHostDaemonCredentials =
    new ExecutionHostDaemonCredentialsService()
  const appSettingsService = new AppSettingsService(
    db,
    stateService,
    async () => Promise.all(providerRegistry.getAll().map((p) => p.describe())),
    new ExecutionHostEndpointRepository(db),
    executionHostDaemonCredentials,
  )
  // Lanes live under the data folder unless Settings says otherwise
  // (MAR-2783, ruling 2). The root is read per creation, never captured.
  const laneService = new LaneService(
    db,
    gitService,
    () =>
      appSettingsService.getLanesPrefsSync().root ??
      join(app.getPath('userData'), 'lanes'),
  )
  const remoteExecutionHosts = new AppSettingsRemoteExecutionHostRegistry({
    appSettings: appSettingsService,
    credentials: executionHostDaemonCredentials,
    onEventSeq: (sessionId, seq) =>
      sessionService.recordRemoteEventSeq(sessionId, seq),
    onWorkspaceReported: (sessionId, workspace) =>
      sessionService.recordReportedWorkspace(sessionId, workspace),
    debugSink,
  })
  // Build a host for every configured Endpoint, which primes each one's
  // provider cache. Failures are expected when a daemon is unconfigured or
  // unreachable and surface later via the connection test.
  void remoteExecutionHosts.primeConfiguredEndpoints().catch(() => {})
  sessionService.setRemoteExecutionHosts(remoteExecutionHosts)
  sessionService.setRemoteWorkspaceSourceResolver((workingDirectory) => {
    const repository = readCloneableRepositoryUrl(workingDirectory)
    return repository ? { repository } : null
  })
  const analyticsService = new AnalyticsService(db, {
    providers: providerRegistry,
    appSettings: appSettingsService,
    workingDirectory: app.getPath('userData'),
  })
  const projectOpenService = new ProjectOpenService()
  registerProjectOpenIpcHandlers(projectOpenService)

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
  const spaceSynthesisService = new SpaceSynthesisService({
    spaces: spaceService,
    sessions: sessionService,
    providers: providerRegistry,
    appSettings: appSettingsService,
  })
  registerSessionForkIpcHandlers(sessionForkService)
  registerProviderAccountIpcHandlers({
    repository: providerAccountRepository,
    enrolment: providerAccountEnrolmentService,
    attestation: providerAccountAttestationService,
    login: providerAccountLoginService,
    mcp: providerAccountMcpService,
  })
  const stopAccountHealthMonitoring =
    providerAccountAttestationService.startMonitoring(() => {
      console.warn('Provider account health check failed')
    })
  registerFeedbackIpcHandlers(feedbackService)
  // Built before the crew doors: deleting a crew forgets its tracker key
  // (MAR-3084 lap 2, C).
  const trackerCredentials = new TrackerCredentialsService()
  registerCrewIpcHandlers({
    service: crewService,
    relays: relayService,
    db,
    forgetTrackerKey: (crewId) => trackerCredentials.deleteKey(crewId),
  })
  registerCrewExportIpc(new CrewExportService(db), crewService)
  registerCrewImportIpc(
    new CrewImportService(db, sessionService, crewService, relayService),
    crewService,
    relayService,
  )
  const crewHailService = new CrewHailService(db)
  // One ledger for the whole process (MAR-3085): the engine writes a lap the
  // moment a verdict settles and the watcher reads the same rows a minute
  // later. Two instances would be two readers of one table with no shared
  // view of what was just written.
  const workLedgerService = new WorkLedgerService(db)
  // The label watcher (MAR-3084): reads each bound crew's tracker and appends
  // what changed to the work ledger. Read-only toward the tracker; the key
  // stays in the Keychain and only the main process reads it. Built before
  // the engine, because a delivered hop is one of the moments it is told the
  // tracker is about to change (MAR-3227 R2).
  const dispatchCrews = () =>
    crewService.list().map((crew) => ({
      ...crew,
      members: crew.members.map((member) => {
        const session = member.sessionId
          ? sessionService.getById(member.sessionId)
          : null
        const master = crew.members.find(
          (candidate) => candidate.role === 'mastermind' && candidate.sessionId,
        )
        const recipeSpec =
          member.kind === 'dynamic' && member.batonName && master?.sessionId
            ? relayService.findSpawnWire(
                crew.id,
                master.sessionId,
                member.batonName,
              )?.spawnSpec
            : null
        const recipeHost =
          member.hostPolicy ?? recipeSpec?.executionHost ?? 'local'
        return {
          ...member,
          providerId: session?.providerId ?? member.providerId,
          executionHost: session?.executionHost ?? recipeHost,
          localWorkingDirectory:
            session && isLocalExecutionHost(session.executionHost)
              ? session.workingDirectory
              : recipeSpec?.projectId && isLocalExecutionHost(recipeHost)
                ? (projectService.getById(recipeSpec.projectId)
                    ?.repositoryPath ?? null)
                : null,
        }
      }),
    }))
  const errandSpawner = new ErrandSpawner({
    sessions: sessionService,
    crews: {
      addMember: (crewId, sessionId) =>
        crewService.addMember(crewId, sessionId),
    },
    relays: relayService,
    accounts: providerAccountRepository,
    onCrewsChanged: () => broadcastCrews(crewService.list()),
    onRelaysChanged: () => broadcastRelays(relayService.list()),
  })
  const dispatchGateway: AutoDispatchGateway & AutoDispatchRecipeGateway = {
    findSpawnWire: (crewId, master, name) =>
      relayService.findSpawnWire(crewId, master, name),
    isSessionLive: (id) => {
      const session = sessionService.getById(id)
      return session !== null && !isTerminalSessionStatus(session.status)
    },
    spawn: (spec, brief, context) => errandSpawner.spawn(spec, brief, context),
    firstDispatchSeenAt: (crewId) =>
      workLedgerService.firstDispatchSeenAt(crewId),
    describeSeatAvailability: (id) =>
      sessionService.describeSeatAvailability(id),
    findWire: (crewId, source, target) =>
      relayService.findWire(crewId, source, target),
    describeLane: (path) => gitService.describeLane(path),
    getLastTurnProviderAccountId: (id) =>
      sessionService.getLastTurnProviderAccountId(id),
    listByProvider: (id) => providerAccountRepository.listByProvider(id),
    sendMessageWithOpener: (id, input) =>
      sessionService.sendMessageWithOpener(id, input),
    deliverRelayMessage: (id, input) =>
      sessionService.deliverRelayMessage(id, input),
    addAutoDispatchNote: (id, text) =>
      sessionService.addAutoDispatchNote(id, text),
    onDispatchTerminal: (listener) =>
      sessionService.onDispatchTerminal(listener),
  }
  const autoDispatcher = new AutoDispatchService(
    db,
    dispatchGateway,
    { list: dispatchCrews },
    workLedgerService,
  )
  const dispatchPlanner = new AutoDispatchPlanService(
    {
      listCrews: dispatchCrews,
      currentView: (id) => workLedgerService.currentView(id),
      firstDispatchSeenAt: dispatchGateway.firstDispatchSeenAt,
      describeSeatAvailability: dispatchGateway.describeSeatAvailability,
      findWire: dispatchGateway.findWire,
      findSpawnWire: dispatchGateway.findSpawnWire,
      liveSpawnCount: (crewId, seat) =>
        autoDispatcher.liveSpawnCount(crewId, seat),
      describeLane: dispatchGateway.describeLane,
    },
    (id) => autoDispatcher.records(id),
  )
  const trackerWatcher = new TrackerWatcherService({
    dispatchPlanner,
    autoDispatcher,
    crews: crewService,
    ledger: workLedgerService,
    resolveKey: (crewId) => trackerCredentials.resolveKey(crewId),
    createAdapter: (input) => createLinearTrackerAdapter(input),
    broadcast: broadcastWorkLedger,
    onRead: broadcastTrackerRead,
    broadcastOutside: broadcastTrackerOutside,
  })
  const relayEngine = new RelayEngine({
    relays: relayService,
    ledger: workLedgerService,
    sessions: sessionService,
    crews: {
      addMember: (crewId, sessionId) =>
        crewService.addMember(crewId, sessionId),
      crewIdsForSession: (sessionId) =>
        crewService.crewIdsForSession(sessionId),
      // The seat a wire is aimed at (MAR-3083): its card rides the first
      // message of a run, and a spawn spec naming a seat reads its recipe.
      findSeatBySession: (crewId, sessionId) =>
        crewService
          .getById(crewId)
          ?.members.find((member) => member.sessionId === sessionId) ?? null,
      findSeatByBatonName: (crewId, batonName) =>
        crewService.findMemberByBatonName(crewId, batonName),
      // Read through the crew rather than copied onto the engine: the knobs
      // belong to the crew, and an engine holding its own copy would keep
      // firing yesterday's cap after the user changed it.
      getLoopLimits: (crewId) => {
        const crew = crewService.getById(crewId)
        return crew
          ? { roundCap: crew.roundCap, stallMinutes: crew.stallMinutes }
          : null
      },
    },
    hails: crewHailService,
    // The first thing in the backend to read the enrolled default. Until now
    // the flag was set here and only ever honoured by the renderer composer,
    // so every turn Convergence started by itself ran on the ambient
    // credential.
    accounts: {
      listByProvider: (providerId) =>
        providerAccountRepository.listByProvider(providerId),
    },
    onHopAppended: (hop) => {
      broadcastRelayHop(hop)
      // A hop that put work in a seat -- delivered, queued or spawned, the
      // engine's own budgeted outcomes -- is a horse about to pick up or a
      // mastermind about to read a return (MAR-3227 R2). Refusals move
      // nothing on the tracker.
      if (isBudgetedOutcome(hop.outcome)) {
        trackerWatcher.noteActivity(hop.crewId)
      }
    },
    onHopSettled: broadcastRelayHopSettled,
    onHailsChanged: () => broadcastCrewHails(crewHailService.listOpen()),
    onRelaysChanged: () => broadcastRelays(relayService.list()),
    onCrewsChanged: () => broadcastCrews(crewService.list()),
  })
  registerCrewHailIpcHandlers({ service: crewHailService })
  // Registered after the engine exists rather than before: clearing a trail
  // has to ask the engine which runs are still moving, and a handler that
  // could not ask would be free to empty the ledger the loop law reads.
  registerRelayIpcHandlers({
    service: relayService,
    runHistory: runHistoryService,
    liveFlowRunIds: () => relayEngine.liveFlowRunIds(),
  })
  // The multi-subscriber settle seam, deliberately not one of the single-slot
  // listener setters: renderer broadcasts and notifications keep theirs.
  sessionService.onSessionSettled((event) => {
    void relayEngine.handleSettle(event)
  })
  // A crew seat coming to rest is the other moment the tracker is about to
  // change (MAR-3227 R2): a horse returning. The watcher ignores a crew with
  // no tracker, so every crew the seat sits in is simply told.
  sessionService.onSessionSettled((event) => {
    for (const crewId of crewService.crewIdsForSession(event.sessionId)) {
      trackerWatcher.noteActivity(crewId)
    }
  })
  // The receipt's other ending: a cancelled or abandoned dispatch releases
  // exactly what the engine was holding for it (MAR-2759).
  sessionService.onDispatchTerminal((event) => {
    relayEngine.handleDispatchTerminal(event)
  })
  // And a receipt handed on: Deliver now re-opens the errand on the run it
  // always belonged to, rather than letting the retry start a run of its own
  // (MAR-2971).
  sessionService.onDispatchRedelivered((event) => {
    relayEngine.handleDispatchRedelivered(event)
  })
  // The context drill (MAR-3255): seal, compact, resurrect, with the queue
  // held shut around all three. Built after the crew service because the
  // routine only runs on a MASTERMIND seat, and that is a question only the
  // crew can answer -- passed as a function rather than as the service, so
  // the drill can see exactly one fact about a crew and no more.
  const contextDrill = new ContextDrillService({
    sessions: {
      // One entry per crew this session has a seat in (MAR-3287 R1); the
      // drill turns the list into none / other-role / mastermind itself.
      seatRolesOf: (sessionId) =>
        crewService
          .crewIdsForSession(sessionId)
          .map(
            (crewId) =>
              crewService
                .getById(crewId)
                ?.members.find((member) => member.sessionId === sessionId)
                ?.role ?? null,
          ),
      describeCompactionReadiness: (sessionId) =>
        sessionService.describeCompactionReadiness(sessionId),
      onSessionSettled: (listener) => sessionService.onSessionSettled(listener),
      holdQueue: (sessionId) => sessionService.holdQueue(sessionId),
      releaseQueue: (sessionId) => sessionService.releaseQueue(sessionId),
      sendDrillBeat: (sessionId, text) =>
        sessionService.sendDrillBeat(sessionId, text),
      getLastAssistantMessageText: (sessionId) =>
        sessionService.getLastAssistantMessageText(sessionId),
      compactContext: (sessionId) => sessionService.compactContext(sessionId),
      addContextDrillNote: (sessionId, text) =>
        sessionService.addContextDrillNote(sessionId, text),
    },
  })
  contextDrill.onDrillChanged(broadcastContextDrillChange)
  registerContextDrillIpcHandlers({ service: contextDrill })
  const drillEvidence = new HarnessEvidenceService(db)
  new AutoDrillService(
    {
      onBeforeQueueDrain: (guard) => sessionService.onBeforeQueueDrain(guard),
      onSessionSettled: (listener) => sessionService.onSessionSettled(listener),
      read: (id) => sessionService.getById(id),
      enabled: (id) =>
        crewService
          .crewIdsForSession(id)
          .some((crewId) =>
            crewService
              .getById(crewId)
              ?.members.some(
                (member) =>
                  member.sessionId === id &&
                  member.role === 'mastermind' &&
                  member.drillAuto,
              ),
          ),
      // The existing read-only evidence door; no provider handle access is needed.
      parallelWork: (id) => drillEvidence.countParallelWork([id]).get(id)!,
      alert: () =>
        parseAppSettings(stateService.get(APP_SETTINGS_KEY)).contextAlert,
      holdQueue: (id) => sessionService.holdQueue(id),
      releaseQueue: (id) => sessionService.releaseQueue(id),
      note: (id, text) => sessionService.addContextDrillInfoNote(id, text),
      changed: broadcastContextDrillChange,
    },
    contextDrill,
  )

  // The stall hail's clock. A station that hangs produces no settle, so the
  // one event that would notice never arrives -- the check has to be driven by
  // time or not at all. Its own module so the timer is testable rather than an
  // untested `setInterval` in the bootstrap.
  startRelayStallClock(relayEngine)

  registerTrackerIpcHandlers({
    credentials: trackerCredentials,
    probe: (crewId) => trackerWatcher.probe(crewId),
    resolveProject: (crewId, reference) =>
      trackerWatcher.resolveProject(crewId, reference),
    crewExists: (crewId) => crewService.getById(crewId) !== null,
    refresh: (crewId) => trackerWatcher.refresh(crewId),
    outside: (crewId) => trackerWatcher.outsideSnapshot(crewId),
  })
  registerWorkLedgerIpcHandlers({
    snapshot: (crewId) => trackerWatcher.snapshot(crewId),
  })
  trackerWatcher.start()
  // Looking counts (MAR-3227 R3): coming back to any window asks for a read,
  // and with no window in front the watcher slows to its background beat.
  app.on('browser-window-focus', () => trackerWatcher.setWindowFocused(true))
  app.on('browser-window-blur', () => trackerWatcher.setWindowFocused(false))

  registerIpcHandlers(
    projectService,
    spaceService,
    stateService,
    workspaceService,
    laneService,
    gitService,
    pullRequestService,
    sessionService,
    providerRegistry,
    mcpService,
    skillsService,
    promptsService,
    appSettingsService,
    openRouterCredentials,
    analyticsService,
    attachmentsService,
    turnCaptureService,
    projectContextService,
    crewService,
    relayService,
    spaceSynthesisService,
    (prefs) => updatesScheduler?.onPrefsChanged(prefs),
    {
      getRuntimeInfo: () => ({
        appNodeVersion: process.versions.node,
        electronVersion: process.versions.electron ?? null,
        appVersion: app.getVersion(),
        isPackaged: app.isPackaged,
        platform: process.platform,
        arch: process.arch,
      }),
      updateProvider: async (providerId) => {
        const provider = detected.find((item) => item.id === providerId)
        if (!provider) {
          return {
            ok: false,
            providerId,
            command: '',
            stdout: '',
            stderr: '',
            error: `Provider is not available: ${providerId}`,
          }
        }

        const result = await updateProviderPackage(
          providerId,
          provider.binaryPath,
        )
        if (result.ok) {
          detected = await refreshDetectedProviders()
        }
        return result
      },
    },
    {
      codex: codexQuotaService,
    },
    {
      credentials: executionHostDaemonCredentials,
      registry: remoteExecutionHosts,
    },
  )

  const terminalService = new TerminalService(ptyFactory, broadcastToRenderers)
  terminalService.setSessionLastTerminalExitObserver(
    ({ sessionId, exitCode }) =>
      sessionService.markShellSessionExited(sessionId, exitCode),
  )
  terminalService.setTerminalIdleObserver((event) => {
    const session = sessionService.getById(event.sessionId)
    if (!session) return
    const projectName = session.projectId
      ? (projectService.getById(session.projectId)?.name ?? 'Unknown project')
      : 'Convergence'
    broadcastToRenderers('terminal:idle', {
      ...event,
      sessionName: session.name,
      projectName,
    })
    notificationsService.fire(
      notificationsService.buildEvent('terminal.idle', session, {
        terminalId: event.terminalId,
        terminalProcessName: event.processName,
      }),
    )
  })
  registerTerminalIpcHandlers(terminalService)

  const terminalLayoutService = new TerminalLayoutService({
    repository: new TerminalLayoutRepository(db),
  })
  registerTerminalLayoutIpcHandlers(terminalLayoutService)

  let sessionsDisposedForQuit = false
  let sessionQuitInFlight = false
  app.on('before-quit', (event) => {
    if (sessionsDisposedForQuit) return
    event.preventDefault()
    if (sessionQuitInFlight) return
    sessionQuitInFlight = true
    stopAccountHealthMonitoring()
    localModelTunnelService.stopMonitoring()
    localModelTunnelService.stopAllManaged()
    // Sessions release their connections; the servers themselves are stopped
    // here, and nowhere else (MAR-2823).
    void Promise.allSettled([
      sessionService.disposeAllForQuit(),
      providerAccountLoginService.shutdown(),
    ]).finally(() => {
      codexServerHosts.stopAll()
      terminalService.disposeAll()
      projectScriptsRunner.disposeAll()
      sessionsDisposedForQuit = true
      app.quit()
    })
  })

  const runtimeIconPath = resolveRuntimeIconPath()
  if (process.platform === 'darwin' && runtimeIconPath) {
    app.dock?.setIcon(runtimeIconPath)
  }

  const onWindowClosed = () => {
    terminalService.disposeAll()
    projectScriptsRunner.disposeAll()
    currentMainWindow = null
  }

  const onWindowCreated = (window: BrowserWindow) => {
    currentMainWindow = window
    notificationsState.attach(window)
  }

  app.on('before-quit', () => {
    autoDispatcher.dispose()
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
