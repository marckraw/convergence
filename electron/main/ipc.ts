import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { ProjectService } from '../backend/project/project.service'
import { SpaceService } from '../backend/space/space.service'
import type { SpaceSynthesisService } from '../backend/space/space-synthesis.service'
import { StateService } from '../backend/state/state.service'
import { WorkspaceService } from '../backend/workspace/workspace.service'
import { GitService } from '../backend/git/git.service'
import { PullRequestService } from '../backend/pull-request/pull-request.service'
import { SessionAppService } from '../backend/app-api/session-app.service'
import { SessionService } from '../backend/session/session.service'
import type { TurnCaptureService } from '../backend/session/turn/turn-capture.service'
import {
  getRecentSessionIds,
  setRecentSessionIds,
} from '../backend/session/session-recents'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import type {
  ProviderRuntimeInfo,
  ProviderUpdateResult,
} from '../backend/provider/provider.types'
import { McpService } from '../backend/mcp/mcp.service'
import { SkillsService } from '../backend/skills/skills.service'
import { PromptsService } from '../backend/prompts/prompts.service'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import { CodexQuotaService } from '../backend/provider-quota/codex-quota.service'
import { ProviderQuotaService } from '../backend/provider-quota/provider-quota.service'
import { createDefaultProviderQuotaSources } from '../backend/provider-quota/provider-quota.sources'
import type { ExecutionHostDaemonCredentialsService } from '../backend/credentials/execution-host-daemon-credentials.service'
import { testRemoteExecutionHostConnection } from '../backend/provider/execution-host/remote-execution-host-connection'
import type { AppSettingsRemoteExecutionHostRegistry } from '../backend/provider/execution-host/remote-execution-host.registry'
import { describeRemoteExecutionHostFailure } from '../backend/provider/execution-host/remote-execution-host.pure'
import { OpenRouterCredentialsService } from '../backend/credentials/openrouter-credentials.service'
import type { AnalyticsService } from '../backend/analytics/analytics.service'
import type { AnalyticsRangePreset } from '../backend/analytics/analytics.types'
import type { AttachmentsService } from '../backend/attachments/attachments.service'
import type { IngestFileInput } from '../backend/attachments/attachments.types'
import type { AppSettingsInput } from '../backend/app-settings/app-settings.types'
import type {
  CloneProjectInput,
  CreateProjectInput,
} from '../backend/project/project.types'
import type {
  CreateSpaceInput,
  CreateSpaceArtifactInput,
  LinkSpaceAttemptInput,
  UpdateSpaceAttemptInput,
  UpdateSpaceInput,
  UpdateSpaceArtifactInput,
} from '../backend/space/space.types'
import type { ProjectContextService } from '../backend/project-context/project-context.service'
import type {
  CreateProjectContextItemInput,
  UpdateProjectContextItemInput,
} from '../backend/project-context/project-context.types'
import type { CreateWorkspaceInput } from '../backend/workspace/workspace.types'
import type { CreateSessionInput } from '../backend/session/session.types'
import type { ProjectSettings } from '../backend/project/project-settings.pure'
import type {
  SkillCatalogOptions,
  SkillDetailsRequest,
  SkillProviderId,
} from '../backend/skills/skills.types'
import type {
  CreatePromptLibraryInput,
  DeletePromptLibraryInput,
  PromptLibraryDetailsRequest,
  PromptLibraryOptions,
  UpdatePromptLibraryInput,
} from '../backend/prompts/prompts.types'
import {
  sendSessionMessageInputFromIpc,
  type SendSessionMessageIpcInput,
} from './session-message-ipc.pure'

interface IngestFileIpcInput {
  name: string
  bytes: Uint8Array | ArrayBuffer | number[]
  mimeType?: string
}

function toUint8Array(input: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  return new Uint8Array(input)
}

const ACTIVE_PROJECT_KEY = 'active_project_id'
const NEEDS_YOU_DISMISSALS_KEY = 'needs_you_dismissals_v1'

type NeedsYouDismissalRecord = Record<
  string,
  {
    updatedAt: string
    disposition: 'snoozed' | 'acknowledged'
  }
>

function parseNeedsYouDismissals(
  value: string | null,
): NeedsYouDismissalRecord {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([sessionId, dismissal]) => {
        const candidate = dismissal as {
          updatedAt?: unknown
          disposition?: unknown
        }

        if (
          typeof dismissal !== 'object' ||
          dismissal === null ||
          typeof candidate.updatedAt !== 'string' ||
          (candidate.disposition !== 'snoozed' &&
            candidate.disposition !== 'acknowledged')
        ) {
          return []
        }

        return [
          [
            sessionId,
            {
              updatedAt: candidate.updatedAt,
              disposition: candidate.disposition,
            },
          ],
        ]
      }),
    )
  } catch {
    return {}
  }
}

export function registerIpcHandlers(
  projectService: ProjectService,
  spaceService: SpaceService,
  stateService: StateService,
  workspaceService: WorkspaceService,
  gitService: GitService,
  pullRequestService: PullRequestService,
  sessionService: SessionService,
  providerRegistry: ProviderRegistry,
  mcpService: McpService,
  skillsService: SkillsService,
  promptsService: PromptsService,
  appSettingsService: AppSettingsService,
  openRouterCredentials: OpenRouterCredentialsService,
  analyticsService: AnalyticsService,
  attachmentsService: AttachmentsService,
  turnCaptureService: TurnCaptureService,
  projectContextService: ProjectContextService,
  spaceSynthesisService?: SpaceSynthesisService,
  onUpdatePrefsChanged?: (prefs: { backgroundCheckEnabled: boolean }) => void,
  providerActions?: {
    getRuntimeInfo: () => ProviderRuntimeInfo
    updateProvider: (providerId: string) => Promise<ProviderUpdateResult>
  },
  providerQuota?: {
    codex: Pick<CodexQuotaService, 'getQuota'>
  },
  executionHostRemote?: {
    credentials: ExecutionHostDaemonCredentialsService
    registry: AppSettingsRemoteExecutionHostRegistry
  },
): void {
  const quotaServices = providerQuota ?? {
    codex: new CodexQuotaService(),
  }
  const providerQuotaService = new ProviderQuotaService(
    createDefaultProviderQuotaSources(quotaServices),
  )
  const sessionApp = new SessionAppService(sessionService, appSettingsService)

  // Project handlers
  ipcMain.handle('project:create', (_event, input: CreateProjectInput) => {
    const existing = projectService.getByRepositoryPath(input.repositoryPath)
    const project = projectService.create(input)
    if (!existing) {
      stateService.set(ACTIVE_PROJECT_KEY, project.id)
    }
    return project
  })

  ipcMain.handle('project:clone', async (_event, input: CloneProjectInput) => {
    const repositoryPath = await gitService.cloneRepository(input)
    const existing = projectService.getByRepositoryPath(repositoryPath)
    const project = projectService.create({
      repositoryPath,
      name: input.name,
    })
    if (!existing) {
      stateService.set(ACTIVE_PROJECT_KEY, project.id)
    }
    return project
  })

  ipcMain.handle('project:getAll', () => projectService.getAll())

  ipcMain.handle('project:getById', (_event, id: string) =>
    projectService.getById(id),
  )

  ipcMain.handle('project:delete', async (_event, id: string) => {
    const activeId = stateService.get(ACTIVE_PROJECT_KEY)
    await projectService.delete(id)
    if (activeId === id) {
      stateService.delete(ACTIVE_PROJECT_KEY)
    }
  })

  ipcMain.handle('project:getActive', () => {
    const activeId = stateService.get(ACTIVE_PROJECT_KEY)
    if (!activeId) return null
    return projectService.getById(activeId)
  })

  ipcMain.handle('project:setActive', (_event, id: string) => {
    const project = projectService.getById(id)
    if (!project) throw new Error(`Project not found: ${id}`)
    stateService.set(ACTIVE_PROJECT_KEY, id)
  })

  ipcMain.handle(
    'project:updateSettings',
    (_event, id: string, settings: ProjectSettings) =>
      projectService.updateSettings(id, settings),
  )

  // Project context handlers
  ipcMain.handle('projectContext:list', (_event, projectId: string) =>
    projectContextService.list(projectId),
  )

  ipcMain.handle(
    'projectContext:create',
    (_event, input: CreateProjectContextItemInput) =>
      projectContextService.create(input),
  )

  ipcMain.handle(
    'projectContext:update',
    (_event, id: string, patch: UpdateProjectContextItemInput) =>
      projectContextService.update(id, patch),
  )

  ipcMain.handle('projectContext:delete', (_event, id: string) => {
    projectContextService.delete(id)
  })

  ipcMain.handle(
    'projectContext:attachToSession',
    (_event, sessionId: string, itemIds: string[]) => {
      projectContextService.attachToSession(sessionId, itemIds)
    },
  )

  ipcMain.handle('projectContext:listForSession', (_event, sessionId: string) =>
    projectContextService.listForSession(sessionId),
  )

  // Space handlers
  ipcMain.handle('space:list', () => spaceService.list())

  ipcMain.handle('space:getById', (_event, id: string) =>
    spaceService.getById(id),
  )

  ipcMain.handle('space:create', (_event, input: CreateSpaceInput) =>
    spaceService.create(input),
  )

  ipcMain.handle(
    'space:update',
    (_event, id: string, input: UpdateSpaceInput) =>
      spaceService.update(id, input),
  )

  ipcMain.handle('space:archive', (_event, id: string) =>
    spaceService.archive(id),
  )

  ipcMain.handle('space:unarchive', (_event, id: string) =>
    spaceService.unarchive(id),
  )

  ipcMain.handle('space:delete', (_event, id: string) => {
    spaceService.delete(id)
  })

  ipcMain.handle('space:listAttempts', (_event, spaceId: string) =>
    spaceService.listAttempts(spaceId),
  )

  ipcMain.handle('space:listAttemptsForSession', (_event, sessionId: string) =>
    spaceService.listAttemptsForSession(sessionId),
  )

  ipcMain.handle('space:linkAttempt', (_event, input: LinkSpaceAttemptInput) =>
    spaceService.linkAttempt(input),
  )

  ipcMain.handle(
    'space:updateAttempt',
    (_event, id: string, input: UpdateSpaceAttemptInput) =>
      spaceService.updateAttempt(id, input),
  )

  ipcMain.handle('space:unlinkAttempt', (_event, id: string) => {
    spaceService.unlinkAttempt(id)
  })

  ipcMain.handle(
    'space:setPrimaryAttempt',
    (_event, spaceId: string, attemptId: string) =>
      spaceService.setPrimaryAttempt(spaceId, attemptId),
  )

  ipcMain.handle('space:listArtifacts', (_event, spaceId: string) =>
    spaceService.listArtifacts(spaceId),
  )

  ipcMain.handle(
    'space:addArtifact',
    (_event, input: CreateSpaceArtifactInput) =>
      spaceService.addArtifact(input),
  )

  ipcMain.handle(
    'space:addArtifactsFromPaths',
    (_event, spaceId: string, paths: string[]) =>
      spaceService.addArtifactsFromPaths(spaceId, paths),
  )

  ipcMain.handle(
    'space:updateArtifact',
    (_event, id: string, input: UpdateSpaceArtifactInput) =>
      spaceService.updateArtifact(id, input),
  )

  ipcMain.handle('space:deleteArtifact', (_event, id: string) => {
    spaceService.deleteArtifact(id)
  })

  ipcMain.handle('space:listSources', (_event, spaceId: string) =>
    spaceService.listSources(spaceId),
  )

  ipcMain.handle(
    'space:addSourcesFromPaths',
    (_event, spaceId: string, paths: string[]) =>
      spaceService.addSourcesFromPaths(spaceId, paths),
  )

  ipcMain.handle('space:deleteSource', (_event, id: string) => {
    spaceService.deleteSource(id)
  })

  ipcMain.handle('space:showSourceOpenDialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select Space Sources',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })

  ipcMain.handle('space:showArtifactOpenDialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select Space Artifacts',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })

  ipcMain.handle(
    'space:synthesize',
    (_event, spaceId: string, requestId?: string) => {
      if (!spaceSynthesisService) {
        throw new Error('Space synthesis service is unavailable')
      }
      return spaceSynthesisService.synthesize(spaceId, requestId)
    },
  )

  // Dialog handlers
  ipcMain.handle('dialog:selectDirectory', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Select a Git Repository',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectCloneParentDirectory', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Clone Destination',
      buttonLabel: 'Use Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Workspace handlers
  ipcMain.handle(
    'workspace:create',
    async (_event, input: CreateWorkspaceInput) =>
      workspaceService.create(input),
  )

  ipcMain.handle('workspace:getByProjectId', (_event, projectId: string) =>
    workspaceService.getByProjectId(projectId),
  )

  ipcMain.handle('workspace:getAll', () => workspaceService.listAll())

  ipcMain.handle(
    'workspace:archive',
    async (_event, input: { id: string; removeWorktree?: boolean }) =>
      workspaceService.archive(input),
  )

  ipcMain.handle('workspace:unarchive', (_event, id: string) =>
    workspaceService.unarchive(id),
  )

  ipcMain.handle('workspace:removeWorktree', (_event, id: string) =>
    workspaceService.removeWorktree(id),
  )

  ipcMain.handle('workspace:syncEnvFiles', (_event, id: string) =>
    workspaceService.syncEnvFiles(id),
  )

  ipcMain.handle('workspace:delete', async (_event, id: string) => {
    await workspaceService.delete(id)
  })

  // Pull request handlers
  ipcMain.handle(
    'pullRequest:getByWorkspaceId',
    (_event, workspaceId: string) =>
      pullRequestService.getByWorkspaceId(workspaceId),
  )

  ipcMain.handle('pullRequest:listByProjectId', (_event, projectId: string) =>
    pullRequestService.listByProjectId(projectId),
  )

  ipcMain.handle('pullRequest:refreshForSession', (_event, sessionId: string) =>
    pullRequestService.refreshForSession(sessionId),
  )

  // Git handlers
  ipcMain.handle('git:getBranches', async (_event, repoPath: string) =>
    gitService.getBranches(repoPath),
  )

  ipcMain.handle('git:getAllBranches', async (_event, repoPath: string) =>
    gitService.getAllBranches(repoPath),
  )

  ipcMain.handle('git:getCurrentBranch', async (_event, repoPath: string) =>
    gitService.getCurrentBranch(repoPath),
  )

  ipcMain.handle('git:getBranchOutputFacts', async (_event, repoPath: string) =>
    gitService.getBranchOutputFacts(repoPath),
  )

  ipcMain.handle('git:getStatus', async (_event, repoPath: string) =>
    gitService.getStatus(repoPath),
  )

  ipcMain.handle(
    'git:getDiff',
    async (_event, repoPath: string, filePath?: string) =>
      gitService.getDiff(repoPath, filePath),
  )

  // App settings handlers
  ipcMain.handle('appSettings:get', async () => {
    const settings = await appSettingsService.getAppSettings()
    // A credential lives and dies with its Endpoint, and a save commits before
    // it destroys the token of a machine it removed (MAR-2642). A Keychain that
    // refused that cleanup — or a quit between the two — leaves an entry filed
    // under an id no Endpoint will ever bear again, so the first settings load
    // of a launch is one place the debt is collected. Detached and swallowed on
    // purpose: reading settings must not wait on `security`.
    //
    // It is not the only place, and it must not be: the renderer loads settings
    // once and keeps them, so a sweep hung off this handler alone would run at
    // most once per launch and a cleanup that failed would sit there until the
    // app was restarted. `appSettings:sweepExecutionHostCredentials` is what
    // the settings dialog calls on every open.
    void appSettingsService
      .sweepOrphanedExecutionHostCredentials()
      .catch(() => {})
    return settings
  })

  /**
   * Collects the credential-cleanup debt, on demand (MAR-2642).
   *
   * The sweep is idempotent — every account under this service belongs to an
   * Endpoint, so one that is not a stored id is garbage whatever left it there
   * — which is what makes it safe to run at every settings-dialog open rather
   * than once at load. The dialog is where a removal is made and where its
   * failure would have been reported, so it is where reopening should be able
   * to finish the job without a restart.
   *
   * Awaited rather than detached, and answering with the accounts it emptied:
   * this handler is asked for the sweep itself, so "it ran" is the only thing
   * it has to report.
   */
  ipcMain.handle('appSettings:sweepExecutionHostCredentials', () =>
    appSettingsService.sweepOrphanedExecutionHostCredentials(),
  )

  ipcMain.handle('appSettings:set', async (_event, input: AppSettingsInput) => {
    const stored = await appSettingsService.setAppSettings(input)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('appSettings:updated', stored)
        win.webContents.send(
          'notifications:prefs-updated',
          stored.notifications,
        )
      }
    }
    onUpdatePrefsChanged?.(stored.updates)
    // A Save can add an Endpoint, and a host born at the first turn would
    // refuse a provider it has never listed. Priming here means the machine is
    // usable as soon as it is configured, without a Test connection first.
    void executionHostRemote?.registry
      .primeConfiguredEndpoints()
      .catch(() => {})
    return stored
  })

  ipcMain.handle('credentials:openrouter:getStatus', () =>
    openRouterCredentials.getStatus(),
  )

  ipcMain.handle(
    'credentials:openrouter:setToken',
    (_event, input: { token?: unknown }) => {
      if (!input || typeof input.token !== 'string') {
        throw new Error('OpenRouter API key is required.')
      }
      return openRouterCredentials.setToken({ token: input.token })
    },
  )

  ipcMain.handle('credentials:openrouter:deleteToken', () =>
    openRouterCredentials.deleteToken(),
  )

  ipcMain.handle('executionHost:sessionCountsByEndpoint', () =>
    sessionService.countSessionsByExecutionHost(),
  )

  if (executionHostRemote) {
    /**
     * Every daemon handler acts on the Endpoint the caller named (MAR-2629).
     *
     * These four used to close over `DEFAULT_EXECUTION_HOST_ENDPOINT_ID`, which
     * was correct only while one Endpoint could exist. With several, an
     * ambient default is the slice-1 defect shape exactly — an id validated
     * upstream and then not the one used — except here it writes a secret: a
     * token saved for kuba-vps would land in backpack-automations' Keychain
     * account and authenticate as the wrong machine.
     *
     * The id is resolved against the configured Endpoints rather than trusted,
     * because an unknown id at `setToken` would store a token under an account
     * no Endpoint will ever read and nothing will ever clean up.
     */
    const requireEndpointId = async (value: unknown): Promise<string> => {
      const endpointId = typeof value === 'string' ? value.trim() : ''
      if (!endpointId) {
        throw new Error('An execution host endpoint id is required.')
      }
      const settings = await appSettingsService.getAppSettings()
      const known = settings.executionHostEndpoints.some(
        (endpoint) => endpoint.id === endpointId,
      )
      if (!known) {
        throw new Error(
          `Execution host endpoint "${endpointId}" is not configured.`,
        )
      }
      return endpointId
    }

    ipcMain.handle(
      'credentials:executionHostDaemon:getStatus',
      async (_event, input: { endpointId?: unknown }) =>
        executionHostRemote.credentials.getStatus(
          await requireEndpointId(input?.endpointId),
        ),
    )

    ipcMain.handle(
      'credentials:executionHostDaemon:setToken',
      async (_event, input: { endpointId?: unknown; token?: unknown }) => {
        const endpointId = await requireEndpointId(input?.endpointId)
        if (!input || typeof input.token !== 'string') {
          throw new Error('Daemon API token is required.')
        }
        return executionHostRemote.credentials.setToken(
          { token: input.token },
          endpointId,
        )
      },
    )

    ipcMain.handle(
      'credentials:executionHostDaemon:deleteToken',
      async (_event, input: { endpointId?: unknown }) =>
        executionHostRemote.credentials.deleteToken(
          await requireEndpointId(input?.endpointId),
        ),
    )

    // The resolver and the host are built from the same id the token handlers
    // above resolved, so "the daemon this row tests" has one encoding rather
    // than two that agree only while there is one Endpoint.
    ipcMain.handle(
      'executionHost:testRemoteConnection',
      async (_event, input: { endpointId?: unknown }) => {
        const endpointId = await requireEndpointId(input?.endpointId)
        return testRemoteExecutionHostConnection({
          resolver: executionHostRemote.registry.resolverFor(endpointId),
          host: executionHostRemote.registry.hostFor(endpointId),
        })
      },
    )

    // Routed through the session service rather than a host held here: the
    // machine to ask is the one the session named, and only the service can
    // turn a session id into it.
    ipcMain.handle(
      'executionHost:getSessionWorkspace',
      async (_event, sessionId: string) => {
        try {
          return {
            ok: true as const,
            info: await sessionService.fetchRemoteSessionWorkspaceInfo(
              sessionId,
            ),
          }
        } catch (error) {
          return {
            ok: false as const,
            message: describeRemoteExecutionHostFailure(error),
          }
        }
      },
    )
  }

  // Analytics handlers
  ipcMain.handle('analytics:getOverview', (_event, rangePreset: string) =>
    analyticsService.getOverview(rangePreset),
  )

  ipcMain.handle('analytics:deleteWorkProfileSnapshot', (_event, id: string) =>
    analyticsService.deleteWorkProfileSnapshot(id),
  )

  ipcMain.handle(
    'analytics:generateWorkProfile',
    (
      _event,
      input: { rangePreset: string; providerId: string; model: string | null },
    ) =>
      analyticsService.generateWorkProfile({
        rangePreset: input.rangePreset as AnalyticsRangePreset,
        providerId: input.providerId,
        model: input.model,
      }),
  )

  // Session handlers
  ipcMain.handle('session:create', async (_event, input: CreateSessionInput) =>
    sessionApp.createSession(input),
  )

  ipcMain.handle(
    'session:getSummariesByProjectId',
    (_event, projectId: string) => sessionApp.listProjectSessions(projectId),
  )

  ipcMain.handle('session:getAllSummaries', () => sessionApp.listSessions())

  ipcMain.handle('session:getGlobalSummaries', () =>
    sessionApp.listGlobalSessions(),
  )

  ipcMain.handle('session:getNeedsYouDismissals', () =>
    parseNeedsYouDismissals(stateService.get(NEEDS_YOU_DISMISSALS_KEY)),
  )

  ipcMain.handle(
    'session:setNeedsYouDismissals',
    (_event, dismissals: NeedsYouDismissalRecord) => {
      stateService.set(NEEDS_YOU_DISMISSALS_KEY, JSON.stringify(dismissals))
    },
  )

  ipcMain.handle('session:getRecentIds', () =>
    getRecentSessionIds(stateService),
  )

  ipcMain.handle('session:setRecentIds', (_event, ids: string[]) => {
    const sanitized = Array.isArray(ids)
      ? ids.filter((value): value is string => typeof value === 'string')
      : []
    setRecentSessionIds(stateService, sanitized)
  })

  ipcMain.handle('session:getSummaryById', (_event, id: string) =>
    sessionApp.getSession(id),
  )

  ipcMain.handle('session:getConversation', (_event, id: string) =>
    sessionApp.getConversation(id),
  )

  ipcMain.handle('session:archive', (_event, id: string) => {
    sessionApp.archiveSession(id)
  })

  ipcMain.handle('session:unarchive', (_event, id: string) => {
    sessionApp.unarchiveSession(id)
  })

  ipcMain.handle('session:delete', (_event, id: string) => {
    sessionApp.deleteSession(id)
  })

  ipcMain.handle(
    'session:start',
    async (_event, id: string, input: SendSessionMessageIpcInput) => {
      await sessionApp.startSession(id, sendSessionMessageInputFromIpc(input))
    },
  )

  ipcMain.handle(
    'session:sendMessage',
    async (_event, id: string, input: SendSessionMessageIpcInput) => {
      await sessionApp.sendSessionMessage(
        id,
        sendSessionMessageInputFromIpc(input),
      )
    },
  )

  ipcMain.handle(
    'session:compactContext',
    async (_event, id: string, instructions?: string) => {
      await sessionApp.compactSessionContext(id, instructions)
    },
  )

  ipcMain.handle('session:getQueuedInputs', (_event, sessionId: string) =>
    sessionApp.listQueuedInputs(sessionId),
  )

  ipcMain.handle('session:cancelQueuedInput', (_event, id: string) => {
    sessionApp.cancelQueuedInput(id)
  })

  // Attachments handlers
  ipcMain.handle(
    'attachments:ingestFiles',
    async (_event, sessionId: string, files: IngestFileIpcInput[]) => {
      const normalized: IngestFileInput[] = files.map((f) => ({
        name: f.name,
        bytes: toUint8Array(f.bytes),
        mimeType: f.mimeType,
      }))
      return attachmentsService.ingestFiles(sessionId, normalized)
    },
  )

  ipcMain.handle(
    'attachments:ingestFromOpenDialog',
    async (event, sessionId: string) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) return null
      const result = await dialog.showOpenDialog(window, {
        properties: ['openFile', 'multiSelections'],
        title: 'Select attachments',
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return attachmentsService.ingestTrustedFilePaths(
        sessionId,
        result.filePaths,
      )
    },
  )

  ipcMain.handle('attachments:getForSession', (_event, sessionId: string) =>
    attachmentsService.getForSession(sessionId),
  )

  ipcMain.handle('attachments:getById', (_event, id: string) =>
    attachmentsService.getById(id),
  )

  ipcMain.handle('attachments:readBytes', async (_event, id: string) => {
    const bytes = await attachmentsService.readBytes(id)
    return bytes
  })

  ipcMain.handle('attachments:delete', async (_event, id: string) => {
    await attachmentsService.delete(id)
  })

  ipcMain.handle(
    'session:approve',
    (_event, id: string, providerApprovalId?: string) => {
      sessionApp.approveAttentionRequest(id, providerApprovalId)
    },
  )

  ipcMain.handle(
    'session:deny',
    (_event, id: string, providerApprovalId?: string) => {
      sessionApp.denyAttentionRequest(id, providerApprovalId)
    },
  )

  ipcMain.handle('session:stop', (_event, id: string) => {
    sessionApp.stopSession(id)
  })

  ipcMain.handle('session:rename', (_event, id: string, name: string) => {
    sessionApp.renameSession(id, name)
  })

  ipcMain.handle(
    'session:regenerateName',
    async (_event, id: string, requestId?: string) =>
      sessionApp.regenerateSessionName(id, requestId),
  )

  ipcMain.handle(
    'session:setPrimarySurface',
    (_event, id: string, surface: 'conversation' | 'terminal') =>
      sessionApp.setSessionPrimarySurface(id, surface),
  )

  ipcMain.handle(
    'session:setModelSelection',
    (
      _event,
      id: string,
      input: { providerId: unknown; model: string | null; effort: unknown },
    ) => sessionApp.setSessionModelSelection(id, input),
  )

  // Provider handlers
  async function loadProviderDescriptors() {
    return Promise.all(providerRegistry.getAll().map((p) => p.describe()))
  }

  function broadcastProviderStatuses(statuses: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('provider:statuses-changed', statuses)
      }
    }
  }

  async function inspectAndBroadcastProviderStatuses() {
    const { inspectProviderStatuses } =
      await import('../backend/provider/detect')
    const statuses = await inspectProviderStatuses()
    broadcastProviderStatuses(statuses)
    return statuses
  }

  ipcMain.handle('provider:getAll', async () =>
    appSettingsService.filterProviderDescriptors(
      await loadProviderDescriptors(),
    ),
  )

  ipcMain.handle('provider:getAllAvailable', loadProviderDescriptors)

  ipcMain.handle('provider:getStatuses', inspectAndBroadcastProviderStatuses)

  ipcMain.handle('provider:getRuntimeInfo', () =>
    providerActions?.getRuntimeInfo(),
  )

  ipcMain.handle('provider:update', async (_event, providerId: string) => {
    if (!providerActions) {
      return {
        ok: false,
        providerId,
        command: '',
        stdout: '',
        stderr: '',
        error: 'Provider updates are unavailable in this app runtime.',
      } satisfies ProviderUpdateResult
    }

    const result = await providerActions.updateProvider(providerId)
    void inspectAndBroadcastProviderStatuses()
    return result
  })

  ipcMain.handle(
    'providerQuota:list',
    (
      _event,
      forceRefresh?: boolean,
      scope?: { executionHostId: string; providerAccountId: string | null },
    ) =>
      providerQuotaService.list({
        forceRefresh: forceRefresh === true,
        scope,
      }),
  )

  ipcMain.handle('mcp:listByProjectId', (_event, projectId: string) =>
    mcpService.listByProjectId(projectId),
  )

  ipcMain.handle('mcp:listGlobal', () => mcpService.listGlobal())

  ipcMain.handle(
    'skills:listByProjectId',
    (_event, projectId: string, options?: SkillCatalogOptions) =>
      skillsService.listByProjectId(projectId, options),
  )

  ipcMain.handle('skills:listGlobal', (_event, options?: SkillCatalogOptions) =>
    skillsService.listGlobal(options),
  )

  ipcMain.handle('skills:listProviderIds', (_event, projectId: string) =>
    skillsService.listProviderIds(projectId),
  )

  ipcMain.handle(
    'skills:listProvider',
    (
      _event,
      projectId: string,
      providerId: SkillProviderId,
      options?: SkillCatalogOptions,
    ) => skillsService.listProvider(projectId, providerId, options),
  )

  ipcMain.handle('skills:readDetails', (_event, input: SkillDetailsRequest) =>
    skillsService.readDetails(input),
  )

  ipcMain.handle(
    'skills:reveal',
    async (_event, input: SkillDetailsRequest) => {
      const path = await skillsService.resolveSkillPath(input)
      shell.showItemInFolder(path)
    },
  )

  ipcMain.handle(
    'skills:openPath',
    async (_event, input: SkillDetailsRequest) => {
      const path = await skillsService.resolveSkillPath(input)
      const error = await shell.openPath(path)
      if (error) {
        throw new Error(error)
      }
    },
  )

  ipcMain.handle(
    'prompts:listByProjectId',
    (_event, projectId: string, options?: PromptLibraryOptions) =>
      promptsService.listByProjectId(projectId, options),
  )

  ipcMain.handle(
    'prompts:listGlobal',
    (_event, options?: PromptLibraryOptions) =>
      promptsService.listGlobal(options),
  )

  ipcMain.handle(
    'prompts:readDetails',
    (_event, input: PromptLibraryDetailsRequest) =>
      promptsService.readDetails(input),
  )

  ipcMain.handle('prompts:create', (_event, input: CreatePromptLibraryInput) =>
    promptsService.create(input),
  )

  ipcMain.handle('prompts:update', (_event, input: UpdatePromptLibraryInput) =>
    promptsService.update(input),
  )

  ipcMain.handle('prompts:delete', (_event, input: DeletePromptLibraryInput) =>
    promptsService.delete(input),
  )

  // Session update event forwarding
  sessionApp.onSessionSummaryUpdate((summary) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('session:summaryUpdated', summary)
      }
    }
  })

  sessionApp.onConversationPatch((event) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('session:conversationPatched', event)
      }
    }
  })

  sessionApp.onQueuedInputPatch((event) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('session:queuedInputPatched', event)
      }
    }
  })

  // Turn-grouped file-change handlers
  ipcMain.handle('turns:listForSession', (_event, sessionId: string) =>
    turnCaptureService.listTurns(sessionId),
  )

  ipcMain.handle('turns:getFileChanges', (_event, turnId: string) =>
    turnCaptureService.listFileChanges(turnId),
  )

  ipcMain.handle(
    'turns:getFileDiff',
    (_event, turnId: string, filePath: string, repoRoot?: string | null) =>
      turnCaptureService.getFileDiff(turnId, filePath, repoRoot),
  )

  sessionApp.onTurnDelta((sessionId, delta) => {
    const payload = { ...delta, sessionId }
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('turns:delta', payload)
      }
    }
  })
}
