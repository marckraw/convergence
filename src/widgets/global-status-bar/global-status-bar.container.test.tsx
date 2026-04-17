import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import type { Project } from '@/entities/project'
import type { ProviderInfo, Session } from '@/entities/session'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { GlobalStatusBar } from './index'

const projects: Project[] = [
  {
    id: 'project-one',
    name: 'Project One',
    repositoryPath: '/tmp/project-one',
    settings: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'project-two',
    name: 'Project Two',
    repositoryPath: '/tmp/project-two',
    settings: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

const providers: ProviderInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    vendorLabel: 'Anthropic',
    supportsContinuation: true,
    defaultModelId: 'sonnet',
    modelOptions: [],
  },
  {
    id: 'codex',
    name: 'Codex',
    vendorLabel: 'OpenAI',
    supportsContinuation: true,
    defaultModelId: 'gpt-5',
    modelOptions: [],
  },
]

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: 's-1',
    projectId: 'project-one',
    workspaceId: null,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name: 'Session',
    status: 'idle',
    attention: 'none',
    workingDirectory: '/tmp',
    transcript: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderBar() {
  return render(
    <TooltipProvider>
      <GlobalStatusBar />
    </TooltipProvider>,
  )
}

describe('GlobalStatusBar container', () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [],
      globalSessions: [],
      needsYouDismissals: {},
      currentProjectId: null,
      activeSessionId: null,
      draftWorkspaceId: null,
      providers,
      error: null,
    })
    useProjectStore.setState({
      projects,
      activeProject: null,
      loading: false,
      error: null,
    })
  })

  it('renders the empty state when no sessions are active', () => {
    renderBar()
    expect(screen.getByText(/no agents running/i)).toBeInTheDocument()
  })

  it('renders aggregate counts, chips, and recency', () => {
    useSessionStore.setState({
      globalSessions: [
        makeSession({
          id: 's-running',
          projectId: 'project-one',
          status: 'running',
          name: 'Building widget',
        }),
        makeSession({
          id: 's-attention',
          projectId: 'project-two',
          providerId: 'codex',
          status: 'running',
          attention: 'needs-approval',
          name: 'Approve edits',
          updatedAt: '2026-02-01T00:00:00.000Z',
        }),
        makeSession({
          id: 's-completed',
          projectId: 'project-one',
          status: 'completed',
          attention: 'finished',
          name: 'Wrapped up',
          updatedAt: '2026-03-01T00:00:00.000Z',
        }),
      ],
    } as Partial<ReturnType<typeof useSessionStore.getState>>)

    renderBar()

    expect(screen.getByText('running').textContent).toBeTruthy()
    expect(screen.getByText('need you').textContent).toBeTruthy()
    expect(
      screen.getByTestId('global-status-chip-project-one'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('global-status-chip-project-two'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('global-status-recency')).toHaveTextContent(
      'Wrapped up',
    )
  })

  it('invokes project switching when a chip is clicked', () => {
    const setActiveProject = vi.fn().mockResolvedValue(undefined)
    const prepareForProject = vi.fn()

    useSessionStore.setState({
      globalSessions: [
        makeSession({
          id: 's-1',
          projectId: 'project-two',
          status: 'running',
        }),
      ],
      prepareForProject,
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    useProjectStore.setState({
      projects,
      activeProject: projects[0],
      setActiveProject,
    } as Partial<ReturnType<typeof useProjectStore.getState>>)

    renderBar()

    fireEvent.click(screen.getByTestId('global-status-chip-project-two'))

    expect(prepareForProject).toHaveBeenCalledWith('project-two')
    expect(setActiveProject).toHaveBeenCalledWith('project-two')
  })

  it('does not re-select the already-active project', () => {
    const setActiveProject = vi.fn().mockResolvedValue(undefined)
    const prepareForProject = vi.fn()

    useSessionStore.setState({
      globalSessions: [
        makeSession({
          id: 's-1',
          projectId: 'project-one',
          status: 'running',
        }),
      ],
      prepareForProject,
    } as Partial<ReturnType<typeof useSessionStore.getState>>)
    useProjectStore.setState({
      projects,
      activeProject: projects[0],
      setActiveProject,
    } as Partial<ReturnType<typeof useProjectStore.getState>>)

    renderBar()

    fireEvent.click(screen.getByTestId('global-status-chip-project-one'))

    expect(setActiveProject).not.toHaveBeenCalled()
    expect(prepareForProject).not.toHaveBeenCalled()
  })
})
