import type { Project } from '@/entities/project'
import type { Workspace } from '@/entities/workspace'
import type {
  Session,
  AttentionState,
  NeedsYouDismissals,
} from '@/entities/session'
import type { DialogKind } from '@/entities/dialog'
import type {
  PaletteItem,
  ProjectPaletteItem,
  WorkspacePaletteItem,
  SessionPaletteItem,
  DialogPaletteItem,
  NewSessionPaletteItem,
  NewWorkspacePaletteItem,
} from './command-center.types'

export interface BuildPaletteIndexInput {
  projects: Project[]
  workspaces: Workspace[]
  sessions: Session[]
  recentSessionIds: string[]
  dismissals: NeedsYouDismissals
}

interface DialogDescriptor {
  kind: DialogKind
  title: string
  description: string
}

export const PALETTE_DIALOGS: DialogDescriptor[] = [
  {
    kind: 'app-settings',
    title: 'App Settings',
    description: 'Preferences, providers, and appearance',
  },
  {
    kind: 'project-settings',
    title: 'Project Settings',
    description: 'Settings for the active project',
  },
  {
    kind: 'providers',
    title: 'Providers',
    description: 'Provider status and availability',
  },
  {
    kind: 'mcp-servers',
    title: 'MCP Servers',
    description: 'Configured MCP servers for this project',
  },
  {
    kind: 'release-notes',
    title: "What's New",
    description: 'Latest release notes and changes',
  },
]

function attentionAlias(attention: AttentionState): string | undefined {
  switch (attention) {
    case 'needs-approval':
      return 'approval needed waiting'
    case 'needs-input':
      return 'input needed waiting'
    case 'finished':
      return 'finished review done'
    case 'failed':
      return 'failed error review'
    default:
      return undefined
  }
}

export function buildPaletteIndex(
  input: BuildPaletteIndexInput,
): PaletteItem[] {
  const { projects, workspaces, sessions } = input

  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const workspacesById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace]),
  )

  const items: PaletteItem[] = []

  for (const project of projects) {
    const item: ProjectPaletteItem = {
      kind: 'project',
      id: `project:${project.id}`,
      projectId: project.id,
      projectName: project.name,
      repositoryPath: project.repositoryPath,
      search: { projectName: project.name, title: project.name },
    }
    items.push(item)
  }

  for (const workspace of workspaces) {
    const project = projectsById.get(workspace.projectId)
    const projectName = project?.name ?? ''
    const item: WorkspacePaletteItem = {
      kind: 'workspace',
      id: `workspace:${workspace.id}`,
      workspaceId: workspace.id,
      projectId: workspace.projectId,
      projectName,
      branchName: workspace.branchName,
      path: workspace.path,
      search: {
        branchName: workspace.branchName,
        projectName,
        title: workspace.branchName,
      },
    }
    items.push(item)
  }

  for (const session of sessions) {
    if (session.archivedAt) continue
    const project = projectsById.get(session.projectId)
    const projectName = project?.name ?? ''
    const workspace = session.workspaceId
      ? (workspacesById.get(session.workspaceId) ?? null)
      : null
    const branchName = workspace?.branchName ?? null
    const item: SessionPaletteItem = {
      kind: 'session',
      id: `session:${session.id}`,
      sessionId: session.id,
      projectId: session.projectId,
      workspaceId: session.workspaceId,
      sessionName: session.name,
      projectName,
      branchName,
      providerId: session.providerId,
      attention: session.attention,
      updatedAt: session.updatedAt,
      search: {
        sessionName: session.name,
        projectName,
        branchName: branchName ?? undefined,
        providerId: session.providerId,
        attentionAlias: attentionAlias(session.attention),
      },
    }
    items.push(item)
  }

  for (const dialog of PALETTE_DIALOGS) {
    const item: DialogPaletteItem = {
      kind: 'dialog',
      id: `dialog:${dialog.kind}`,
      dialogKind: dialog.kind,
      title: dialog.title,
      description: dialog.description,
      search: { title: dialog.title },
    }
    items.push(item)
  }

  for (const workspace of workspaces) {
    const project = projectsById.get(workspace.projectId)
    const projectName = project?.name ?? ''
    const title = `New session in ${workspace.branchName}`
    const item: NewSessionPaletteItem = {
      kind: 'new-session',
      id: `new-session:${workspace.id}`,
      workspaceId: workspace.id,
      projectId: workspace.projectId,
      branchName: workspace.branchName,
      projectName,
      title,
      search: {
        title,
        branchName: workspace.branchName,
        projectName,
      },
    }
    items.push(item)
  }

  for (const project of projects) {
    const title = `New workspace in ${project.name}`
    const item: NewWorkspacePaletteItem = {
      kind: 'new-workspace',
      id: `new-workspace:${project.id}`,
      projectId: project.id,
      projectName: project.name,
      title,
      search: { title, projectName: project.name },
    }
    items.push(item)
  }

  return items
}
