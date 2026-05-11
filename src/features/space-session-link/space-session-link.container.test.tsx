import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore } from '@/entities/space'
import type { Space, SpaceAttempt } from '@/entities/space'
import { useSessionStore } from '@/entities/session'
import { SpaceSessionLinkDialogContainer } from './space-session-link.container'

const space: Space = {
  id: 'i1',
  title: 'Agent-native work tracking',
  status: 'exploring',
  attention: 'none',
  brief: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const attempt: SpaceAttempt = {
  id: 'a1',
  spaceId: 'i1',
  sessionId: 's1',
  role: 'seed',
  isPrimary: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const session = {
  id: 's1',
  contextKind: 'project' as const,
  projectId: 'p1',
  workspaceId: 'w1',
  providerId: 'codex',
  model: null,
  effort: null,
  name: 'Explore Space linking',
  status: 'completed' as const,
  attention: 'finished' as const,
  activity: null,
  contextWindow: null,
  workingDirectory: '/tmp/project',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation' as const,
  continuationToken: null,
  lastSequence: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockElectronAPI = {
  space: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listAttempts: vi.fn(),
    listAttemptsForSession: vi.fn(),
    linkAttempt: vi.fn(),
    updateAttempt: vi.fn(),
    unlinkAttempt: vi.fn(),
    setPrimaryAttempt: vi.fn(),
    listArtifacts: vi.fn(),
    addArtifact: vi.fn(),
    updateArtifact: vi.fn(),
    deleteArtifact: vi.fn(),
    synthesize: vi.fn(),
  },
}

describe('SpaceSessionLinkDialogContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    })
    mockElectronAPI.space.list.mockResolvedValue([space])
    mockElectronAPI.space.listAttempts.mockResolvedValue([attempt])
    mockElectronAPI.space.listAttemptsForSession.mockResolvedValue([])
    mockElectronAPI.space.create.mockResolvedValue(space)
    mockElectronAPI.space.linkAttempt.mockResolvedValue(attempt)
    mockElectronAPI.space.unlinkAttempt.mockResolvedValue(undefined)
    useDialogStore.setState({
      openDialog: 'space-session-link',
      payload: { sessionId: 's1' },
    })
    useSessionStore.setState({
      sessions: [session],
      globalSessions: [session],
      activeConversation: [],
      activeConversationSessionId: null,
      needsYouDismissals: {},
      recentSessionIds: [],
      currentProjectId: 'p1',
      activeSessionId: 's1',
      draftWorkspaceId: null,
      providers: [],
      error: null,
    })
    useSpaceStore.setState({
      spaces: [],
      attemptsBySpaceId: {},
      attemptsBySessionId: {},
      artifactsBySpaceId: {},
      loading: false,
      error: null,
    })
  })

  it('creates a Space from the current session as a primary seed Attempt', async () => {
    render(<SpaceSessionLinkDialogContainer />)

    await screen.findByDisplayValue('Explore Space linking')
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockElectronAPI.space.create).toHaveBeenCalledWith({
        title: 'Explore Space linking',
      })
      expect(mockElectronAPI.space.linkAttempt).toHaveBeenCalledWith({
        spaceId: 'i1',
        sessionId: 's1',
        role: 'seed',
        isPrimary: true,
      })
    })
  })

  it('attaches the current session to an existing Space with a role', async () => {
    render(<SpaceSessionLinkDialogContainer />)

    fireEvent.change(await screen.findByLabelText(/existing space/i), {
      target: { value: 'i1' },
    })
    fireEvent.change(screen.getByLabelText(/attempt role/i), {
      target: { value: 'review' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^attach$/i }))

    await waitFor(() => {
      expect(mockElectronAPI.space.linkAttempt).toHaveBeenCalledWith({
        spaceId: 'i1',
        sessionId: 's1',
        role: 'review',
      })
    })
  })
})
