import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_SETTINGS, useProjectStore } from '@/entities/project'
import type { Project } from '@/entities/project'
import { useWorkspaceStore } from '@/entities/workspace'
import type { Workspace } from '@/entities/workspace'
import { useSessionStore } from '@/entities/session'
import type { Session } from '@/entities/session'
import { useCommandCenterStore } from './command-center.model'

vi.mock('./intents', () => ({
  switchToSession: vi.fn<(sessionId: string) => Promise<void>>(
    async () => undefined,
  ),
  activateProject: vi.fn<(projectId: string) => Promise<void>>(
    async () => undefined,
  ),
  openDialog: vi.fn<(kind: string) => void>(),
  beginSessionDraft: vi.fn<(workspaceId: string) => Promise<void>>(
    async () => undefined,
  ),
  beginWorkspaceDraft: vi.fn<(projectId: string) => Promise<void>>(
    async () => undefined,
  ),
}))

import { CommandCenterContainer } from './command-center.container'
import * as intents from './intents'

function makeProject(id: string, name: string): Project {
  return {
    id,
    name,
    repositoryPath: `/repos/${name}`,
    settings: DEFAULT_PROJECT_SETTINGS,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeWorkspace(
  id: string,
  projectId: string,
  branch: string,
): Workspace {
  return {
    id,
    projectId,
    branchName: branch,
    path: `/repos/${projectId}/${branch}`,
    type: 'worktree',
    archivedAt: null,
    worktreeRemovedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeSession(
  id: string,
  projectId: string,
  workspaceId: string | null,
  name: string,
): Session {
  return {
    id,
    projectId,
    workspaceId,
    providerId: 'claude-code',
    model: null,
    effort: null,
    name,
    status: 'idle',
    attention: 'none',
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
  }
}

const alpha = makeProject('p1', 'alpha')
const beta = makeProject('p2', 'beta')
const alphaMain = makeWorkspace('w1', 'p1', 'main')
const betaFeature = makeWorkspace('w2', 'p2', 'feature-x')
const alphaSession = makeSession('s1', 'p1', 'w1', 'resolve auth bug')
const betaSession = makeSession('s2', 'p2', 'w2', 'add telemetry')

describe('CommandCenterContainer', () => {
  beforeEach(() => {
    vi.mocked(intents.switchToSession).mockClear()
    vi.mocked(intents.activateProject).mockClear()
    vi.mocked(intents.openDialog).mockClear()
    vi.mocked(intents.beginSessionDraft).mockClear()
    vi.mocked(intents.beginWorkspaceDraft).mockClear()

    useCommandCenterStore.setState({ isOpen: false, query: '' })
    useProjectStore.setState({
      projects: [alpha, beta],
      activeProject: alpha,
    })
    useWorkspaceStore.setState({
      workspaces: [alphaMain],
      globalWorkspaces: [alphaMain, betaFeature],
      currentBranch: 'main',
    })
    useSessionStore.setState({
      sessions: [alphaSession],
      globalSessions: [alphaSession, betaSession],
      needsYouDismissals: {},
      recentSessionIds: [],
      currentProjectId: 'p1',
      activeSessionId: null,
      draftWorkspaceId: null,
      providers: [],
      error: null,
    })
  })

  it('renders curated sections in spec order when opened with empty query', () => {
    render(<CommandCenterContainer />)

    act(() => {
      useCommandCenterStore.getState().open()
    })

    const list = screen.getByRole('listbox')
    const headings = within(list).getAllByRole('presentation', { hidden: true })
    const headingTexts = within(list)
      .getAllByText(/Projects|Workspaces|Dialogs|Recent|Waiting|Review/, {
        selector: 'div[cmdk-group-heading]',
      })
      .map((el) => el.textContent?.trim())

    expect(headings.length).toBeGreaterThan(0)
    expect(headingTexts).toEqual(['Projects', 'Workspaces', 'Dialogs'])
  })

  it('shows a ranked list when a query is typed', () => {
    render(<CommandCenterContainer />)

    act(() => {
      useCommandCenterStore.getState().open()
    })

    const input = screen.getByPlaceholderText(/Search projects/i)
    fireEvent.change(input, { target: { value: 'auth' } })

    expect(screen.queryByText('Projects')).toBeNull()
    expect(screen.getByText('resolve auth bug')).toBeInTheDocument()
  })

  it('selecting a session in another project dispatches switchToSession and closes', () => {
    render(<CommandCenterContainer />)

    act(() => {
      useCommandCenterStore.getState().open()
    })

    fireEvent.change(screen.getByPlaceholderText(/Search projects/i), {
      target: { value: 'telemetry' },
    })

    fireEvent.click(screen.getByText('add telemetry'))

    expect(intents.switchToSession).toHaveBeenCalledWith('s2')
    expect(useCommandCenterStore.getState().isOpen).toBe(false)
  })

  it('Cmd+K keydown toggles the palette open and closed', () => {
    render(<CommandCenterContainer />)

    expect(useCommandCenterStore.getState().isOpen).toBe(false)

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
      )
    })
    expect(useCommandCenterStore.getState().isOpen).toBe(true)

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
      )
    })
    expect(useCommandCenterStore.getState().isOpen).toBe(false)
  })

  it('surfaces New session for a matching workspace branch under a typed query', () => {
    render(<CommandCenterContainer />)

    act(() => {
      useCommandCenterStore.getState().open()
    })

    fireEvent.change(screen.getByPlaceholderText(/Search projects/i), {
      target: { value: 'feature-x' },
    })

    fireEvent.click(screen.getByText('New session in feature-x'))

    expect(intents.beginSessionDraft).toHaveBeenCalledWith('w2')
    expect(useCommandCenterStore.getState().isOpen).toBe(false)
  })

  it('ignores keys that are not the palette shortcut', () => {
    render(<CommandCenterContainer />)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    })
    expect(useCommandCenterStore.getState().isOpen).toBe(false)

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          metaKey: true,
          shiftKey: true,
        }),
      )
    })
    expect(useCommandCenterStore.getState().isOpen).toBe(false)
  })
})
