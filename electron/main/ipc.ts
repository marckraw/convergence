import { ipcMain, dialog, BrowserWindow } from 'electron'
import { ProjectService } from '../backend/project/project.service'
import { StateService } from '../backend/state/state.service'
import { WorkspaceService } from '../backend/workspace/workspace.service'
import { GitService } from '../backend/git/git.service'
import { SessionService } from '../backend/session/session.service'
import { ProviderRegistry } from '../backend/provider/provider-registry'
import { McpService } from '../backend/mcp/mcp.service'
import { AppSettingsService } from '../backend/app-settings/app-settings.service'
import type { AttachmentsService } from '../backend/attachments/attachments.service'
import type { IngestFileInput } from '../backend/attachments/attachments.types'
import type { AppSettingsInput } from '../backend/app-settings/app-settings.types'
import type { CreateProjectInput } from '../backend/project/project.types'
import type { CreateWorkspaceInput } from '../backend/workspace/workspace.types'
import type { CreateSessionInput } from '../backend/session/session.types'
import type { ProjectSettings } from '../backend/project/project-settings.pure'

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
  stateService: StateService,
  workspaceService: WorkspaceService,
  gitService: GitService,
  sessionService: SessionService,
  providerRegistry: ProviderRegistry,
  mcpService: McpService,
  appSettingsService: AppSettingsService,
  attachmentsService: AttachmentsService,
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

  ipcMain.handle('workspace:delete', async (_event, id: string) => {
    await workspaceService.delete(id)
  })

  // Git handlers
  ipcMain.handle('git:getBranches', async (_event, repoPath: string) =>
    gitService.getBranches(repoPath),
  )

  ipcMain.handle('git:getCurrentBranch', async (_event, repoPath: string) =>
    gitService.getCurrentBranch(repoPath),
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
      }
    }
    return stored
  })

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

  ipcMain.handle('session:getByProjectId', (_event, projectId: string) =>
    sessionService.getByProjectId(projectId),
  )

  ipcMain.handle('session:getAll', () => sessionService.getAll())

  ipcMain.handle('session:getNeedsYouDismissals', () =>
    parseNeedsYouDismissals(stateService.get(NEEDS_YOU_DISMISSALS_KEY)),
  )

  ipcMain.handle(
    'session:setNeedsYouDismissals',
    (_event, dismissals: NeedsYouDismissalRecord) => {
      stateService.set(NEEDS_YOU_DISMISSALS_KEY, JSON.stringify(dismissals))
    },
  )

  ipcMain.handle('session:getById', (_event, id: string) =>
    sessionService.getById(id),
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
    (_event, id: string, input: { text: string; attachmentIds?: string[] }) => {
      sessionService.start(id, {
        text: input.text,
        attachmentIds: input.attachmentIds,
      })
    },
  )

  ipcMain.handle(
    'session:sendMessage',
    (_event, id: string, input: { text: string; attachmentIds?: string[] }) => {
      sessionService.sendMessage(id, {
        text: input.text,
        attachmentIds: input.attachmentIds,
      })
    },
  )

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

  // Session update event forwarding
  sessionService.setUpdateListener((session) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('session:updated', session)
      }
    }
  })
}
