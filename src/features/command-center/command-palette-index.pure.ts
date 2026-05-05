import type { Project } from '@/entities/project'
import type { Workspace } from '@/entities/workspace'
import type {
  SessionSummary,
  AttentionState,
  NeedsYouDismissals,
} from '@/entities/session'
import type { DialogKind, DialogPayload } from '@/entities/dialog'
import type {
  PaletteItem,
  ProjectPaletteItem,
  WorkspacePaletteItem,
  SessionPaletteItem,
  DialogPaletteItem,
  NewSessionPaletteItem,
  NewTerminalSessionPaletteItem,
  SwapPrimarySurfacePaletteItem,
  NewWorkspacePaletteItem,
  ForkSessionPaletteItem,
  CheckUpdatesPaletteItem,
} from './command-center.types'

export interface BuildPaletteIndexInput {
  projects: Project[]
  workspaces: Workspace[]
  sessions: SessionSummary[]
  recentSessionIds: string[]
  dismissals: NeedsYouDismissals
  activeSessionId?: string | null
}

interface DialogDescriptor {
  id?: string
  kind: DialogKind
  payload?: DialogPayload
  title: string
  description: string
  aliases?: string
}

export const PALETTE_DIALOGS: DialogDescriptor[] = [
  {
    kind: 'initiative-workboard',
    title: 'Initiatives',
    description: 'Global workboard for agent-driven delivery',
  },
  {
    kind: 'app-settings',
    title: 'App Settings',
    description: 'Preferences, providers, and appearance',
  },
  {
    id: 'app-settings:insights',
    kind: 'app-settings',
    payload: { appSettingsSection: 'insights' },
    title: 'Open Insights',
    description: 'Local analytics, usage stats, and work style profile',
    aliases: 'analytics stats usage work style streaks charts',
  },
  {
    kind: 'project-settings',
    title: 'Project Settings',
    description: 'Settings for the active project',
  },
  {
    kind: 'pull-request-review-start',
    title: 'Review Pull Request',
    description: 'Create a local review workspace and agent session',
    aliases: 'pr github code review pull request checkout',
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
    kind: 'skills-browser',
    title: 'Skills',
    description: 'Provider skill browser for this project',
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

function providerAliases(providerId: string): string | undefined {
  if (providerId === 'shell') return 'terminal shell console command line cli'
  return undefined
}

export function buildPaletteIndex(
  input: BuildPaletteIndexInput,
): PaletteItem[] {
  const { projects, workspaces, sessions, activeSessionId } = input

  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const workspacesById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace]),
  )
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))

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
    if (session.contextKind !== 'project' || !session.projectId) continue
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
        aliases: providerAliases(session.providerId),
      },
    }
    items.push(item)
  }

  for (const dialog of PALETTE_DIALOGS) {
    const item: DialogPaletteItem = {
      kind: 'dialog',
      id: `dialog:${dialog.id ?? dialog.kind}`,
      dialogKind: dialog.kind,
      dialogPayload: dialog.payload,
      title: dialog.title,
      description: dialog.description,
      search: { title: dialog.title, aliases: dialog.aliases },
    }
    items.push(item)
  }

  const checkUpdates: CheckUpdatesPaletteItem = {
    kind: 'check-updates',
    id: 'check-updates',
    title: 'Check for updates…',
    description: 'Look for a new Convergence release',
    search: { title: 'Check for updates' },
  }
  items.push(checkUpdates)

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

    const terminalTitle = `New terminal in ${workspace.branchName}`
    const terminalItem: NewTerminalSessionPaletteItem = {
      kind: 'new-terminal-session',
      id: `new-terminal-session:${workspace.id}`,
      workspaceId: workspace.id,
      projectId: workspace.projectId,
      branchName: workspace.branchName,
      projectName,
      title: terminalTitle,
      search: {
        title: terminalTitle,
        branchName: workspace.branchName,
        projectName,
      },
    }
    items.push(terminalItem)
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

  if (activeSessionId) {
    const focused = sessionsById.get(activeSessionId)
    if (
      focused &&
      focused.contextKind === 'project' &&
      focused.projectId &&
      !focused.archivedAt &&
      focused.providerId !== 'shell'
    ) {
      const project = projectsById.get(focused.projectId)
      const projectName = project?.name ?? ''
      const title = `Fork session: ${focused.name}`
      const item: ForkSessionPaletteItem = {
        kind: 'fork-session',
        id: `fork-session:${focused.id}`,
        sessionId: focused.id,
        sessionName: focused.name,
        projectName,
        title,
        search: {
          title,
          sessionName: focused.name,
          projectName,
        },
      }
      items.push(item)

      const target =
        focused.primarySurface === 'terminal' ? 'conversation' : 'terminal'
      const swapTitle =
        target === 'terminal'
          ? `Show terminal as main: ${focused.name}`
          : `Show conversation as main: ${focused.name}`
      const swapItem: SwapPrimarySurfacePaletteItem = {
        kind: 'swap-primary-surface',
        id: `swap-primary-surface:${focused.id}`,
        sessionId: focused.id,
        sessionName: focused.name,
        projectName,
        target,
        title: swapTitle,
        search: {
          title: swapTitle,
          sessionName: focused.name,
          projectName,
        },
      }
      items.push(swapItem)
    }
  }

  return items
}
