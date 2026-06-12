import { ipcMain, dialog, BrowserWindow } from 'electron'
import { ProjectService } from '../backend/project/project.service'
import { SpaceService } from '../backend/space/space.service'
import type { SpaceSynthesisService } from '../backend/space/space-synthesis.service'
import { StateService } from '../backend/state/state.service'
import { WorkspaceService } from '../backend/workspace/workspace.service'
import { GitService } from '../backend/git/git.service'
import { ChangedFilesService } from '../backend/git/changed-files.service'
import type { CodeReviewService } from '../backend/code-review/code-review.service'
import type { CodeReviewGuideService } from '../backend/code-review-guide/code-review-guide.service'
import type { RemoteCodeReviewGuideDaemonClient } from '../backend/code-review-guide/remote-daemon-guide.service'
import { PullRequestService } from '../backend/pull-request/pull-request.service'
import type { PullRequestReviewService } from '../backend/pull-request/pull-request-review.service'
import type { ReviewNotesService } from '../backend/review-notes/review-notes.service'
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
import { ClaudeQuotaService } from '../backend/provider-quota/claude-quota.service'
import { GuidedReviewDaemonCredentialsService } from '../backend/credentials/guided-review-daemon-credentials.service'
import type { ExecutionHostDaemonCredentialsService } from '../backend/credentials/execution-host-daemon-credentials.service'
import type { RemoteExecutionHost } from '../backend/provider/execution-host/remote-execution-host'
import {
  testRemoteExecutionHostConnection,
  type AppSettingsRemoteExecutionHostConnectionResolver,
} from '../backend/provider/execution-host/remote-execution-host-connection'
import { describeRemoteExecutionHostFailure } from '../backend/provider/execution-host/remote-execution-host.pure'
import { OpenRouterCredentialsService } from '../backend/credentials/openrouter-credentials.service'
import type { AnalyticsService } from '../backend/analytics/analytics.service'
import type { AnalyticsRangePreset } from '../backend/analytics/analytics.types'
import type { AttachmentsService } from '../backend/attachments/attachments.service'
import type { IngestFileInput } from '../backend/attachments/attachments.types'
import type { AppSettingsInput } from '../backend/app-settings/app-settings.types'
import type { CreateProjectInput } from '../backend/project/project.types'
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
import type {
  CreateReviewNoteInput,
  PreviewReviewNotePacketInput,
  SendReviewNotePacketInput,
  UpdateReviewNoteInput,
} from '../backend/review-notes/review-notes.types'
import type {
  CodeReviewFilePatchRequest,
  CodeReviewListTargetsRequest,
  CodeReviewSummaryRequest,
} from '../backend/code-review/code-review.types'
import type {
  CodeReviewGuideGenerateRequest,
  CodeReviewGuideLookupRequest,
} from '../backend/code-review-guide/code-review-guide.types'
import type { CreateWorkspaceInput } from '../backend/workspace/workspace.types'
import type { CreateSessionInput } from '../backend/session/session.types'
import type { ProjectSettings } from '../backend/project/project-settings.pure'
import type {
  SkillCatalogOptions,
  SkillDetailsRequest,
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
  changedFilesService: ChangedFilesService,
  codeReviewService: CodeReviewService,
  codeReviewGuideService: CodeReviewGuideService,
  remoteCodeReviewGuideDaemonClient: RemoteCodeReviewGuideDaemonClient,
  pullRequestService: PullRequestService,
  pullRequestReviewService: PullRequestReviewService,
  reviewNotesService: ReviewNotesService,
  sessionService: SessionService,
  providerRegistry: ProviderRegistry,
  mcpService: McpService,
  skillsService: SkillsService,
  promptsService: PromptsService,
  appSettingsService: AppSettingsService,
  guidedReviewDaemonCredentials: GuidedReviewDaemonCredentialsService,
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
    codex: CodexQuotaService
    claude: ClaudeQuotaService
  },
  executionHostRemote?: {
    credentials: ExecutionHostDaemonCredentialsService
    host: RemoteExecutionHost
    resolver: AppSettingsRemoteExecutionHostConnectionResolver
  },
): void {
  const quotaServices = providerQuota ?? {
    codex: new CodexQuotaService(),
    claude: new ClaudeQuotaService(),
  }
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

  ipcMain.handle(
    'pullRequest:previewReview',
    (_event, input: { projectId?: string | null; reference: string }) =>
      pullRequestReviewService.previewReview(input),
  )

  ipcMain.handle(
    'pullRequest:prepareReviewSession',
    (
      _event,
      input: {
        projectId?: string | null
        reference: string
        providerId: string
        model: string | null
        effort: CreateSessionInput['effort']
        sessionName?: string
      },
    ) => pullRequestReviewService.prepareReviewSession(input),
  )

  ipcMain.handle(
    'pullRequest:materializeReviewWorkspace',
    (_event, input: { projectId?: string | null; reference: string }) =>
      pullRequestReviewService.materializeReviewWorkspace(input),
  )

  // Review note handlers
  ipcMain.handle('reviewNotes:listBySession', (_event, sessionId: string) =>
    reviewNotesService.listBySession(sessionId),
  )

  ipcMain.handle('reviewNotes:create', (_event, input: CreateReviewNoteInput) =>
    reviewNotesService.create(input),
  )

  ipcMain.handle(
    'reviewNotes:update',
    (_event, id: string, patch: UpdateReviewNoteInput) =>
      reviewNotesService.update(id, patch),
  )

  ipcMain.handle('reviewNotes:delete', (_event, id: string) => {
    reviewNotesService.delete(id)
  })

  ipcMain.handle(
    'reviewNotes:previewPacket',
    (_event, input: PreviewReviewNotePacketInput) =>
      reviewNotesService.previewPacket(input),
  )

  ipcMain.handle(
    'reviewNotes:sendPacket',
    (_event, input: SendReviewNotePacketInput) =>
      reviewNotesService.sendPacket(input, (sessionId, text) =>
        sessionApp.sendSessionMessage(sessionId, { text }),
      ),
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

  ipcMain.handle('git:getBaseBranchStatus', async (_event, sessionId: string) =>
    changedFilesService.getBaseBranchStatus(sessionId),
  )

  ipcMain.handle(
    'git:getBaseBranchDiff',
    async (_event, sessionId: string, filePath: string) =>
      changedFilesService.getBaseBranchDiff({ sessionId, filePath }),
  )

  ipcMain.handle(
    'codeReview:listTargets',
    async (_event, input: CodeReviewListTargetsRequest) =>
      codeReviewService.listTargets(input),
  )

  ipcMain.handle(
    'codeReview:getSummary',
    async (_event, input: CodeReviewSummaryRequest) =>
      codeReviewService.getSummary(input),
  )

  ipcMain.handle(
    'codeReview:getFilePatch',
    async (_event, input: CodeReviewFilePatchRequest) =>
      codeReviewService.getFilePatch(input),
  )

  ipcMain.handle(
    'codeReviewGuide:getGuide',
    async (_event, input: CodeReviewGuideLookupRequest) =>
      codeReviewGuideService.getGuide(input),
  )

  ipcMain.handle(
    'codeReviewGuide:generateGuide',
    async (_event, input: CodeReviewGuideGenerateRequest) =>
      codeReviewGuideService.generateGuide(input),
  )

  ipcMain.handle(
    'codeReviewGuide:refreshGuide',
    async (_event, input: CodeReviewGuideGenerateRequest) =>
      codeReviewGuideService.refreshGuide(input),
  )

  ipcMain.handle('codeReviewGuide:testRemoteDaemonConnection', () =>
    remoteCodeReviewGuideDaemonClient.testConnection(),
  )

  // App settings handlers
  ipcMain.handle('appSettings:get', () => appSettingsService.getAppSettings())

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

  ipcMain.handle('credentials:guidedReviewDaemon:getStatus', () =>
    guidedReviewDaemonCredentials.getStatus(),
  )

  ipcMain.handle(
    'credentials:guidedReviewDaemon:setToken',
    (_event, input: { token?: unknown }) => {
      if (!input || typeof input.token !== 'string') {
        throw new Error('Daemon API token is required.')
      }
      return guidedReviewDaemonCredentials.setToken({ token: input.token })
    },
  )

  ipcMain.handle('credentials:guidedReviewDaemon:deleteToken', () =>
    guidedReviewDaemonCredentials.deleteToken(),
  )

  if (executionHostRemote) {
    ipcMain.handle('credentials:executionHostDaemon:getStatus', () =>
      executionHostRemote.credentials.getStatus(),
    )

    ipcMain.handle(
      'credentials:executionHostDaemon:setToken',
      (_event, input: { token?: unknown }) => {
        if (!input || typeof input.token !== 'string') {
          throw new Error('Daemon API token is required.')
        }
        return executionHostRemote.credentials.setToken({ token: input.token })
      },
    )

    ipcMain.handle('credentials:executionHostDaemon:deleteToken', () =>
      executionHostRemote.credentials.deleteToken(),
    )

    ipcMain.handle('executionHost:testRemoteConnection', () =>
      testRemoteExecutionHostConnection({
        resolver: executionHostRemote.resolver,
        host: executionHostRemote.host,
      }),
    )

    ipcMain.handle(
      'executionHost:getSessionWorkspace',
      async (_event, sessionId: string) => {
        try {
          return {
            ok: true as const,
            info: await executionHostRemote.host.fetchSessionWorkspaceInfo(
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
    'attachments:ingestFromPaths',
    async (_event, sessionId: string, paths: string[]) => {
      return attachmentsService.ingestFromPaths(sessionId, paths)
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

  ipcMain.handle('attachments:showOpenDialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select attachments',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
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

  ipcMain.handle('providerQuota:getCodex', (_event, forceRefresh?: boolean) =>
    quotaServices.codex.getQuota({ forceRefresh: forceRefresh === true }),
  )

  ipcMain.handle('providerQuota:getClaude', (_event, forceRefresh?: boolean) =>
    quotaServices.claude.getQuota({ forceRefresh: forceRefresh === true }),
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

  ipcMain.handle('skills:readDetails', (_event, input: SkillDetailsRequest) =>
    skillsService.readDetails(input),
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
    (_event, turnId: string, filePath: string) =>
      turnCaptureService.getFileDiff(turnId, filePath),
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
