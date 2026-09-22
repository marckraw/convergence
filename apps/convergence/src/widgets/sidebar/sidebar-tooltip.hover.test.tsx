import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { SidebarSearchToggle } from './sidebar-search-toggle.presentational'
import { SidebarToolsMenu } from './sidebar-tools-menu.presentational'
import {
  BRANCHES_STAY_OPEN_WHILE_YOU_SEARCH,
  ProjectTree,
} from './project-tree.container'
import {
  GlobalChatSessionList,
  type ChatSidebarSpace,
} from './global-chat-session-list.presentational'
import { Sidebar } from './sidebar.container'
import type { SessionSummary } from '@/entities/session'

/**
 * One rendered hover per sidebar file that converted a hint (MAR-3314 R1).
 *
 * `pointermove` with a mouse pointer is the event Radix's trigger reads;
 * `findByRole('tooltip')` waits out the provider delay. Read off `screen`:
 * the content is portalled to `document.body`.
 */
const hover = async (control: Element) => {
  await act(async () => {
    fireEvent.pointerMove(control, { pointerType: 'mouse' })
  })
  return screen.findByRole('tooltip')
}

const baseSession = {
  contextKind: 'project' as const,
  projectId: 'project-1',
  workspaceId: null,
  model: 'sonnet',
  effort: 'medium' as const,
  status: 'completed' as const,
  attention: 'finished' as const,
  activity: null,
  contextWindow: null,
  workingDirectory: '/tmp',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation' as const,
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  providerId: 'codex',
  executionHost: 'local',
}

function session(
  partial: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'name'>,
): SessionSummary {
  return { ...baseSession, ...partial } as SessionSummary
}

vi.mock('@/features', () => {
  const Dialog = ({ trigger }: { trigger?: import('react').ReactNode }) =>
    trigger ?? null
  return {
    AppSettingsDialogContainer: Dialog,
    SpaceWorkboardDialogContainer: Dialog,
    McpServersDialogContainer: Dialog,
    ProjectContextSettings: Dialog,
    ProjectCreateDialogContainer: Dialog,
    ProjectSettingsDialogContainer: Dialog,
    PromptLibraryBrowserDialogContainer: Dialog,
    ProviderStatusDialogContainer: Dialog,
    ReleaseNotesDialogContainer: Dialog,
    SkillsBrowserDialogContainer: Dialog,
    SpaceCreateDialogContainer: Dialog,
    ThemeToggleButton: Dialog,
    WorkspaceCreateDialogContainer: Dialog,
    LaneCreateDialogContainer: Dialog,
  }
})

describe('MAR-3314 R1: per-file sidebar hover', () => {
  it('sidebar-search-toggle names Search conversations on hover', async () => {
    render(
      <TooltipProvider>
        <SidebarSearchToggle open={false} onToggle={vi.fn()} />
      </TooltipProvider>,
    )
    const control = screen.getByRole('button', {
      name: 'Search conversations',
    })
    // Mutation: keep title= beside the Tooltip -> the R2 pin goes red.
    expect(control.getAttribute('title')).toBeNull()
    const tip = await hover(control)
    expect(tip.textContent).toBe('Search conversations')
    expect(tip.textContent).toBe(control.getAttribute('aria-label'))
  })

  it('sidebar-tools-menu names Open sidebar tools on hover', async () => {
    render(
      <TooltipProvider>
        <SidebarToolsMenu
          activeSurface="code"
          hasActiveProject
          iconOnly
          onOpenDialog={vi.fn()}
        />
      </TooltipProvider>,
    )
    const control = screen.getByRole('button', {
      name: 'Open sidebar tools',
    })
    expect(control.getAttribute('title')).toBeNull()
    const tip = await hover(control)
    expect(tip.textContent).toBe('Open sidebar tools')
    expect(tip.textContent).toBe(control.getAttribute('aria-label'))
  })

  it('project-tree session actions reuse the accessible name on hover', async () => {
    render(
      <TooltipProvider>
        <ProjectTree
          cardContext={{
            projectName: 'Project',
            endpoints: [],
            now: Date.parse('2026-01-01T00:00:00Z'),
          }}
          baseBranchName="master"
          workspaces={[]}
          sessions={[session({ id: 'one', name: 'First conversation' })]}
          activeSessionId={null}
          onSelectSession={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
          onRenameSession={vi.fn()}
          onRegenerateSessionName={vi.fn()}
          onDeleteWorkspace={vi.fn()}
          onOpenCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    )
    const control = screen.getByRole('button', {
      name: 'Session actions First conversation',
    })
    expect(control.getAttribute('title')).toBeNull()
    const tip = await hover(control)
    expect(tip.textContent).toBe('Session actions First conversation')
    expect(tip.textContent).toBe(control.getAttribute('aria-label'))
  })

  it('project-tree branch tooltip shows both lines while searching', async () => {
    const props = {
      cardContext: { projectName: 'Project', endpoints: [], now: 0 },
      baseBranchName: 'master',
      workspaces: [
        {
          id: 'match',
          projectId: 'project-1',
          branchName: 'matching-branch',
          path: '/tmp/match',
          type: 'worktree' as const,
          archivedAt: null,
          worktreeRemovedAt: null,
          createdAt: '2026-01-01',
        },
      ],
      sessions: [
        session({
          id: 'match-session',
          workspaceId: 'match',
          name: 'Matching conversation',
        }),
      ],
      activeSessionId: null,
      expandedWorkspaces: new Set<string>(['match']),
      onToggleWorkspace: vi.fn(),
      onSelectSession: vi.fn(),
      onArchiveSession: vi.fn(),
      onUnarchiveSession: vi.fn(),
      onDeleteSession: vi.fn(),
      onRenameSession: vi.fn(),
      onRegenerateSessionName: vi.fn(),
      onDeleteWorkspace: vi.fn(),
      onOpenCreateWorkspace: vi.fn(),
    }

    const closedView = render(
      <TooltipProvider>
        <ProjectTree {...props} nameSearchQuery="" />
      </TooltipProvider>,
    )
    const closedBranch = screen.getByRole('button', {
      name: /^matching-branch/,
    })
    const closed = await hover(closedBranch)
    expect(closed.textContent).toBe('matching-branch')
    expect(closed.textContent).not.toContain(
      BRANCHES_STAY_OPEN_WHILE_YOU_SEARCH,
    )
    closedView.unmount()

    render(
      <TooltipProvider>
        <ProjectTree {...props} nameSearchQuery="Matching" />
      </TooltipProvider>,
    )
    const branch = screen.getByRole('button', { name: /^matching-branch/ })
    expect(branch.getAttribute('title')).toBeNull()
    const tip = await hover(branch)
    // Mutation: drop the conditional searching line -> red.
    expect(tip.textContent).toContain('matching-branch')
    expect(tip.textContent).toContain(BRANCHES_STAY_OPEN_WHILE_YOU_SEARCH)
  })

  it('global-chat-session-list session actions reuse the accessible name on hover', async () => {
    const space: ChatSidebarSpace = {
      id: 'space-1',
      title: 'Launch plan',
      archivedAt: null,
      attempts: [],
    }
    render(
      <TooltipProvider>
        <GlobalChatSessionList
          spaces={[space]}
          sessions={[session({ id: 'g1', name: 'Planning chat' })]}
          activeSessionId={null}
          selectedSpaceId={null}
          expandedSpaceIds={new Set()}
          archivedSpacesExpanded={false}
          onNewSession={vi.fn()}
          onNewSpace={vi.fn()}
          onSelectSpace={vi.fn()}
          onToggleSpace={vi.fn()}
          onToggleArchivedSpaces={vi.fn()}
          onArchiveSpace={vi.fn()}
          onUnarchiveSpace={vi.fn()}
          onSelectSpaceAttempt={vi.fn()}
          onSelectSession={vi.fn()}
          onManageSessionSpaces={vi.fn()}
          onDetachSpaceAttempt={vi.fn()}
          onArchiveSession={vi.fn()}
          onUnarchiveSession={vi.fn()}
          onDeleteSession={vi.fn()}
        />
      </TooltipProvider>,
    )
    const control = screen.getByRole('button', {
      name: 'Chat session actions Planning chat',
    })
    expect(control.getAttribute('title')).toBeNull()
    const tip = await hover(control)
    expect(tip.textContent).toBe('Chat session actions Planning chat')
    expect(tip.textContent).toBe(control.getAttribute('aria-label'))
  })

  it('sidebar.container collapsed expand control reuses the accessible name on hover', async () => {
    const noop = vi.fn()
    render(
      <TooltipProvider>
        <Sidebar
          activeSurface="code"
          onSelectSurface={noop}
          onSelectSession={noop}
          activeSessionId={null}
          onSelectGlobalSession={noop}
          onNewGlobalSession={noop}
          selectedSpaceId={null}
          onSelectSpace={noop}
          activeGlobalSessionId={null}
          collapsed
          peek={false}
          onCollapse={noop}
          onExpand={noop}
          onPeek={noop}
          onPinPeek={noop}
        />
      </TooltipProvider>,
    )
    const control = screen.getByRole('button', { name: 'Expand sidebar' })
    expect(control.getAttribute('title')).toBeNull()
    const tip = await hover(control)
    expect(tip.textContent).toBe('Expand sidebar')
    expect(tip.textContent).toBe(control.getAttribute('aria-label'))
  })
})
