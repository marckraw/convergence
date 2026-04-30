import { ipcMain, dialog, BrowserWindow } from 'electron'
import { ProjectService } from '../backend/project/project.service'
import { InitiativeService } from '../backend/initiative/initiative.service'
import type { InitiativeSynthesisService } from '../backend/initiative/initiative-synthesis.service'
import { StateService } from '../backend/state/state.service'
import { WorkspaceService } from '../backend/workspace/workspace.service'
import { GitService } from '../backend/git/git.service'
import { SessionService } from '../backend/session/session.service'
import type { TurnCaptureService } from '../backend/session/turn/turn-capture.service'
import {
  getRecentSessionIds,
  setRecentSessionIds,
} from '../backend/session/session-recents'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { McpService } from '../backend/mcp/mcp.service'
import { SkillsService } from '../backend/skills/skills.service'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import type { AnalyticsService } from '../backend/analytics/analytics.service'
import type { AnalyticsRangePreset } from '../backend/analytics/analytics.types'
import type { AttachmentsService } from '../backend/attachments/attachments.service'
import type { IngestFileInput } from '../backend/attachments/attachments.types'
import type { AppSettingsInput } from '../backend/app-settings/app-settings.types'
import type { CreateProjectInput } from '../backend/project/project.types'
import type {
  CreateInitiativeInput,
  CreateInitiativeOutputInput,
  LinkInitiativeAttemptInput,
  UpdateInitiativeAttemptInput,
  UpdateInitiativeInput,
  UpdateInitiativeOutputInput,
} from '../backend/initiative/initiative.types'
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
} from '../backend/skills/skills.types'
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
  initiativeService: InitiativeService,
  stateService: StateService,
  workspaceService: WorkspaceService,
  gitService: GitService,
  sessionService: SessionService,
  providerRegistry: ProviderRegistry,
  mcpService: McpService,
  skillsService: SkillsService,
  appSettingsService: AppSettingsService,
  analyticsService: AnalyticsService,
  attachmentsService: AttachmentsService,
  turnCaptureService: TurnCaptureService,
  projectContextService: ProjectContextService,
  initiativeSynthesisService?: InitiativeSynthesisService,
  onUpdatePrefsChanged?: (prefs: { backgroundCheckEnabled: boolean }) => void,
): void {
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

  // Initiative handlers
  ipcMain.handle('initiative:list', () => initiativeService.list())

  ipcMain.handle('initiative:getById', (_event, id: string) =>
    initiativeService.getById(id),
  )

  ipcMain.handle('initiative:create', (_event, input: CreateInitiativeInput) =>
    initiativeService.create(input),
  )

  ipcMain.handle(
    'initiative:update',
    (_event, id: string, input: UpdateInitiativeInput) =>
      initiativeService.update(id, input),
  )

  ipcMain.handle('initiative:delete', (_event, id: string) => {
    initiativeService.delete(id)
  })

  ipcMain.handle('initiative:listAttempts', (_event, initiativeId: string) =>
    initiativeService.listAttempts(initiativeId),
  )

  ipcMain.handle(
    'initiative:listAttemptsForSession',
    (_event, sessionId: string) =>
      initiativeService.listAttemptsForSession(sessionId),
  )

  ipcMain.handle(
    'initiative:linkAttempt',
    (_event, input: LinkInitiativeAttemptInput) =>
      initiativeService.linkAttempt(input),
  )

  ipcMain.handle(
    'initiative:updateAttempt',
    (_event, id: string, input: UpdateInitiativeAttemptInput) =>
      initiativeService.updateAttempt(id, input),
  )

  ipcMain.handle('initiative:unlinkAttempt', (_event, id: string) => {
    initiativeService.unlinkAttempt(id)
  })

  ipcMain.handle(
    'initiative:setPrimaryAttempt',
    (_event, initiativeId: string, attemptId: string) =>
      initiativeService.setPrimaryAttempt(initiativeId, attemptId),
  )

  ipcMain.handle('initiative:listOutputs', (_event, initiativeId: string) =>
    initiativeService.listOutputs(initiativeId),
  )

  ipcMain.handle(
    'initiative:addOutput',
    (_event, input: CreateInitiativeOutputInput) =>
      initiativeService.addOutput(input),
  )

  ipcMain.handle(
    'initiative:updateOutput',
    (_event, id: string, input: UpdateInitiativeOutputInput) =>
      initiativeService.updateOutput(id, input),
  )

  ipcMain.handle('initiative:deleteOutput', (_event, id: string) => {
    initiativeService.deleteOutput(id)
  })

  ipcMain.handle(
    'initiative:synthesize',
    (_event, initiativeId: string, requestId?: string) => {
      if (!initiativeSynthesisService) {
        throw new Error('Initiative synthesis service is unavailable')
      }
      return initiativeSynthesisService.synthesize(initiativeId, requestId)
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

  ipcMain.handle('workspace:delete', async (_event, id: string) => {
    await workspaceService.delete(id)
  })

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
  ipcMain.handle(
    'session:create',
    async (_event, input: CreateSessionInput) => {
      const defaults = await appSettingsService.resolveSessionDefaults()
      const resolved: CreateSessionInput = defaults
        ? {
            ...input,
            providerId: input.providerId || defaults.providerId,
            model: input.model ?? defaults.modelId,
            effort: input.effort ?? defaults.effortId,
          }
        : input
      return sessionService.create(resolved)
    },
  )

  ipcMain.handle(
    'session:getSummariesByProjectId',
    (_event, projectId: string) =>
      sessionService.getSummariesByProjectId(projectId),
  )

  ipcMain.handle('session:getAllSummaries', () =>
    sessionService.getAllSummaries(),
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
    sessionService.getSummaryById(id),
  )

  ipcMain.handle('session:getConversation', (_event, id: string) =>
    sessionService.getConversation(id),
  )

  ipcMain.handle('session:archive', (_event, id: string) => {
    sessionService.archive(id)
  })

  ipcMain.handle('session:unarchive', (_event, id: string) => {
    sessionService.unarchive(id)
  })

  ipcMain.handle('session:delete', (_event, id: string) => {
    sessionService.delete(id)
  })

  ipcMain.handle(
    'session:start',
    async (_event, id: string, input: SendSessionMessageIpcInput) => {
      await sessionService.start(id, sendSessionMessageInputFromIpc(input))
    },
  )

  ipcMain.handle(
    'session:sendMessage',
    async (_event, id: string, input: SendSessionMessageIpcInput) => {
      await sessionService.sendMessage(
        id,
        sendSessionMessageInputFromIpc(input),
      )
    },
  )

  ipcMain.handle('session:getQueuedInputs', (_event, sessionId: string) =>
    sessionService.getQueuedInputs(sessionId),
  )

  ipcMain.handle('session:cancelQueuedInput', (_event, id: string) => {
    sessionService.cancelQueuedInput(id)
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

  ipcMain.handle('session:approve', (_event, id: string) => {
    sessionService.approve(id)
  })

  ipcMain.handle('session:deny', (_event, id: string) => {
    sessionService.deny(id)
  })

  ipcMain.handle('session:stop', (_event, id: string) => {
    sessionService.stop(id)
  })

  ipcMain.handle('session:rename', (_event, id: string, name: string) => {
    sessionService.rename(id, name)
  })

  ipcMain.handle('session:regenerateName', async (_event, id: string) => {
    await sessionService.regenerateName(id)
  })

  ipcMain.handle(
    'session:setPrimarySurface',
    (_event, id: string, surface: 'conversation' | 'terminal') =>
      sessionService.setPrimarySurface(id, surface),
  )

  // Provider handlers
  ipcMain.handle('provider:getAll', async () =>
    Promise.all(providerRegistry.getAll().map((p) => p.describe())),
  )

  ipcMain.handle('provider:getStatuses', async () => {
    const { inspectProviderStatuses } =
      await import('../backend/provider/detect')
    return inspectProviderStatuses()
  })

  ipcMain.handle('mcp:listByProjectId', (_event, projectId: string) =>
    mcpService.listByProjectId(projectId),
  )

  ipcMain.handle(
    'skills:listByProjectId',
    (_event, projectId: string, options?: SkillCatalogOptions) =>
      skillsService.listByProjectId(projectId, options),
  )

  ipcMain.handle('skills:readDetails', (_event, input: SkillDetailsRequest) =>
    skillsService.readDetails(input),
  )

  // Session update event forwarding
  sessionService.setSummaryUpdateListener((summary) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('session:summaryUpdated', summary)
      }
    }
  })

  sessionService.setConversationPatchListener((event) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('session:conversationPatched', event)
      }
    }
  })

  sessionService.setQueuedInputPatchListener((event) => {
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

  sessionService.setTurnDeltaListener((sessionId, delta) => {
    const payload = { ...delta, sessionId }
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('turns:delta', payload)
      }
    }
  })
}
