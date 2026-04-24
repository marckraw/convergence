import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useDialogStore } from '@/entities/dialog'
import { useInitiativeStore } from '@/entities/initiative'
import type {
  Initiative,
  InitiativeAttempt,
  InitiativeOutput,
} from '@/entities/initiative'
import { useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
import { InitiativeWorkboardDialogContainer } from './initiative-workboard.container'

const initiative: Initiative = {
  id: 'i1',
  title: 'Agent-native work tracking',
  status: 'exploring',
  attention: 'none',
  currentUnderstanding: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const updatedInitiative: Initiative = {
  ...initiative,
  title: 'Initiatives V1',
  status: 'implementing',
  currentUnderstanding: 'Stable current understanding.',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const secondInitiative: Initiative = {
  ...initiative,
  id: 'i2',
  title: 'Linked session context',
  currentUnderstanding: 'Show context beside the session.',
}

const output: InitiativeOutput = {
  id: 'o1',
  initiativeId: 'i1',
  kind: 'pull-request',
  label: 'Public PR',
  value: 'https://github.com/example/repo/pull/1',
  sourceSessionId: null,
  status: 'planned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const attempt: InitiativeAttempt = {
  id: 'a1',
  initiativeId: 'i1',
  sessionId: 's1',
  role: 'implementation',
  isPrimary: true,
  createdAt: '2026-01-01T00:00:00.000Z',
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
  },
  git: {
    getBranchOutputFacts: vi.fn(),
  },
}

describe('InitiativeWorkboardDialogContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    })
    mockElectronAPI.initiative.list.mockResolvedValue([initiative])
    mockElectronAPI.initiative.listAttempts.mockResolvedValue([])
    mockElectronAPI.initiative.listOutputs.mockResolvedValue([])
    mockElectronAPI.initiative.create.mockResolvedValue(initiative)
    mockElectronAPI.initiative.update.mockResolvedValue(updatedInitiative)
    mockElectronAPI.initiative.addOutput.mockResolvedValue(output)
    mockElectronAPI.initiative.updateOutput.mockResolvedValue({
      ...output,
      status: 'ready',
    })
    mockElectronAPI.initiative.deleteOutput.mockResolvedValue(undefined)
    mockElectronAPI.git.getBranchOutputFacts.mockResolvedValue({
      branchName: 'feature-output',
      upstreamBranch: 'origin/feature-output',
      remoteUrl: 'git@github.com:example/repo.git',
    })
    useDialogStore.setState({ openDialog: null, payload: null })
    useInitiativeStore.setState({
      initiatives: [],
      attemptsByInitiativeId: {},
      outputsByInitiativeId: {},
      loading: false,
      error: null,
    })
    useProjectStore.setState({
      projects: [
        {
          id: 'p1',
          name: 'convergence',
          repositoryPath: '/tmp/convergence',
          settings: {
            workspaceCreation: {
              startStrategy: 'base-branch',
              baseBranchName: null,
            },
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    useWorkspaceStore.setState({
      globalWorkspaces: [
        {
          id: 'w1',
          projectId: 'p1',
          branchName: 'feature-output',
          path: '/tmp/convergence',
          type: 'worktree',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    useSessionStore.setState({
      globalSessions: [
        {
          id: 's1',
          projectId: 'p1',
          workspaceId: 'w1',
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Implement output suggestions',
          status: 'completed',
          attention: 'finished',
          activity: null,
          contextWindow: null,
          workingDirectory: '/tmp/convergence',
          archivedAt: null,
          parentSessionId: null,
          forkStrategy: null,
          primarySurface: 'conversation',
          continuationToken: null,
          lastSequence: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
  })

  it('loads Initiatives when opened', async () => {
    render(<InitiativeWorkboardDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /initiatives/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.list).toHaveBeenCalled()
    })
    expect(
      await screen.findByText('Agent-native work tracking'),
    ).toBeInTheDocument()
  })

  it('creates and selects an Initiative', async () => {
    mockElectronAPI.initiative.list.mockResolvedValue([])
    render(<InitiativeWorkboardDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /initiatives/i }))
    fireEvent.change(screen.getByLabelText(/new initiative title/i), {
      target: { value: 'Agent-native work tracking' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create initiative/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.create).toHaveBeenCalledWith({
        title: 'Agent-native work tracking',
      })
    })
    expect(
      screen.getByDisplayValue('Agent-native work tracking'),
    ).toBeInTheDocument()
  })

  it('saves stable Initiative fields', async () => {
    render(<InitiativeWorkboardDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /initiatives/i }))
    await screen.findByText('Agent-native work tracking')
    fireEvent.change(screen.getByDisplayValue('Agent-native work tracking'), {
      target: { value: 'Initiatives V1' },
    })
    fireEvent.change(screen.getByDisplayValue('Exploring'), {
      target: { value: 'implementing' },
    })
    fireEvent.change(
      screen.getByPlaceholderText(
        /stable notes, decisions, constraints, and next action/i,
      ),
      { target: { value: 'Stable current understanding.' } },
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.update).toHaveBeenCalledWith('i1', {
        title: 'Initiatives V1',
        status: 'implementing',
        currentUnderstanding: 'Stable current understanding.',
      })
    })
  })

  it('opens focused on a payload Initiative id', async () => {
    mockElectronAPI.initiative.list.mockResolvedValue([
      initiative,
      secondInitiative,
    ])
    useDialogStore.setState({
      openDialog: 'initiative-workboard',
      payload: { initiativeId: 'i2' },
    })

    render(<InitiativeWorkboardDialogContainer />)

    expect(
      await screen.findByDisplayValue('Linked session context'),
    ).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('Show context beside the session.'),
    ).toBeInTheDocument()
  })

  it('creates a manual Output for the selected Initiative', async () => {
    render(<InitiativeWorkboardDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /initiatives/i }))
    await screen.findByText('Agent-native work tracking')
    fireEvent.click(screen.getByRole('button', { name: /add output/i }))
    fireEvent.change(screen.getByLabelText(/new output label/i), {
      target: { value: 'Public PR' },
    })
    fireEvent.change(screen.getByLabelText(/new output value/i), {
      target: { value: 'https://github.com/example/repo/pull/1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create output/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.addOutput).toHaveBeenCalledWith({
        initiativeId: 'i1',
        kind: 'pull-request',
        label: 'Public PR',
        value: 'https://github.com/example/repo/pull/1',
        status: 'planned',
        sourceSessionId: null,
      })
    })
  })

  it('updates and removes manual Outputs', async () => {
    mockElectronAPI.initiative.listOutputs.mockResolvedValue([output])
    render(<InitiativeWorkboardDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /initiatives/i }))
    await screen.findByDisplayValue('Public PR')
    fireEvent.change(screen.getByLabelText(/status for public pr/i), {
      target: { value: 'ready' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /remove output public pr/i }),
    )

    await waitFor(() => {
      expect(mockElectronAPI.initiative.updateOutput).toHaveBeenCalledWith(
        'o1',
        { status: 'ready' },
      )
    })
    expect(mockElectronAPI.initiative.deleteOutput).toHaveBeenCalledWith('o1')
  })

  it('discovers and accepts branch Output suggestions', async () => {
    mockElectronAPI.initiative.listAttempts.mockResolvedValue([attempt])
    mockElectronAPI.initiative.addOutput.mockResolvedValue({
      ...output,
      id: 'o2',
      kind: 'branch',
      label: 'Branch feature-output',
      value: 'feature-output',
      sourceSessionId: 's1',
      status: 'in-progress',
    })
    render(<InitiativeWorkboardDialogContainer />)

    fireEvent.click(screen.getByRole('button', { name: /initiatives/i }))
    await screen.findByText('Implement output suggestions')
    fireEvent.click(screen.getByRole('button', { name: /discover/i }))

    expect(await screen.findByText('Branch feature-output')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /accept/i }))

    await waitFor(() => {
      expect(mockElectronAPI.initiative.addOutput).toHaveBeenCalledWith({
        initiativeId: 'i1',
        kind: 'branch',
        label: 'Branch feature-output',
        value: 'feature-output',
        sourceSessionId: 's1',
        status: 'in-progress',
      })
    })
  })
})
