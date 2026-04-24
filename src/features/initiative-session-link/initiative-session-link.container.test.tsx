import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useDialogStore } from '@/entities/dialog'
import { useInitiativeStore } from '@/entities/initiative'
import type { Initiative, InitiativeAttempt } from '@/entities/initiative'
import { useSessionStore } from '@/entities/session'
import { InitiativeSessionLinkDialogContainer } from './initiative-session-link.container'

const initiative: Initiative = {
  id: 'i1',
  title: 'Agent-native work tracking',
  status: 'exploring',
  attention: 'none',
  currentUnderstanding: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const attempt: InitiativeAttempt = {
  id: 'a1',
  initiativeId: 'i1',
  sessionId: 's1',
  role: 'seed',
  isPrimary: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const session = {
  id: 's1',
  projectId: 'p1',
  workspaceId: 'w1',
  providerId: 'codex',
  model: null,
  effort: null,
  name: 'Explore Initiative linking',
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
  initiative: {
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
    listOutputs: vi.fn(),
    addOutput: vi.fn(),
    updateOutput: vi.fn(),
    deleteOutput: vi.fn(),
    synthesize: vi.fn(),
  },
}

describe('InitiativeSessionLinkDialogContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    })
    mockElectronAPI.initiative.list.mockResolvedValue([initiative])
    mockElectronAPI.initiative.listAttempts.mockResolvedValue([attempt])
    mockElectronAPI.initiative.listAttemptsForSession.mockResolvedValue([])
    mockElectronAPI.initiative.create.mockResolvedValue(initiative)
    mockElectronAPI.initiative.linkAttempt.mockResolvedValue(attempt)
    mockElectronAPI.initiative.unlinkAttempt.mockResolvedValue(undefined)
    useDialogStore.setState({
      openDialog: 'initiative-session-link',
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
    useInitiativeStore.setState({
      initiatives: [],
      attemptsByInitiativeId: {},
      attemptsBySessionId: {},
      outputsByInitiativeId: {},
      loading: false,
      error: null,
    })
  })

  it('creates an Initiative from the current session as a primary seed Attempt', async () => {
    render(<InitiativeSessionLinkDialogContainer />)

    await screen.findByDisplayValue('Explore Initiative linking')
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.create).toHaveBeenCalledWith({
        title: 'Explore Initiative linking',
      })
      expect(mockElectronAPI.initiative.linkAttempt).toHaveBeenCalledWith({
        initiativeId: 'i1',
        sessionId: 's1',
        role: 'seed',
        isPrimary: true,
      })
    })
  })

  it('attaches the current session to an existing Initiative with a role', async () => {
    render(<InitiativeSessionLinkDialogContainer />)

    fireEvent.change(await screen.findByLabelText(/existing initiative/i), {
      target: { value: 'i1' },
    })
    fireEvent.change(screen.getByLabelText(/attempt role/i), {
      target: { value: 'review' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^attach$/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.linkAttempt).toHaveBeenCalledWith({
        initiativeId: 'i1',
        sessionId: 's1',
        role: 'review',
      })
    })
  })
})
