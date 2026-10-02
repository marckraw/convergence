import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { selectOption } from '@/shared/testing/select-option'
import { useDialogStore } from '@/entities/dialog'
import { useSpaceStore } from '@/entities/space'
import type { Space, SpaceAttempt, SpaceArtifact } from '@/entities/space'
import { DEFAULT_PROJECT_SETTINGS, useProjectStore } from '@/entities/project'
import { useSessionStore } from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
import { SpaceWorkboardDialogContainer } from './space-workboard.container'

/** The sidebar's menus open it through the dialog store; it has no trigger of its own (NAV-34). */
const openSpaces = () =>
  act(() => {
    useDialogStore.getState().open('space-workboard')
  })

const space: Space = {
  id: 'i1',
  title: 'Agent-native work tracking',
  status: 'exploring',
  attention: 'none',
  brief: '',
  memory: '',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const updatedSpace: Space = {
  ...space,
  title: 'Spaces V1',
  status: 'implementing',
  attention: 'blocked',
  brief: 'Stable current understanding.',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const secondSpace: Space = {
  ...space,
  id: 'i2',
  title: 'Linked session context',
  brief: 'Show context beside the session.',
}

const artifact: SpaceArtifact = {
  id: 'o1',
  spaceId: 'i1',
  kind: 'pull-request',
  label: 'Public PR',
  value: 'https://github.com/example/repo/pull/1',
  sourceSessionId: null,
  status: 'planned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const attempt: SpaceAttempt = {
  id: 'a1',
  spaceId: 'i1',
  sessionId: 's1',
  role: 'implementation',
  isPrimary: true,
  createdAt: '2026-01-01T00:00:00.000Z',
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
    listSources: vi.fn(),
    addSourcesFromPaths: vi.fn(),
    deleteSource: vi.fn(),
    showSourceOpenDialog: vi.fn(),
    synthesize: vi.fn(),
  },
  git: {
    getBranchOutputFacts: vi.fn(),
  },
}

describe('SpaceWorkboardDialogContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true,
      configurable: true,
    })
    mockElectronAPI.space.list.mockResolvedValue([space])
    mockElectronAPI.space.listAttempts.mockResolvedValue([])
    mockElectronAPI.space.listArtifacts.mockResolvedValue([])
    mockElectronAPI.space.create.mockResolvedValue(space)
    mockElectronAPI.space.update.mockResolvedValue(updatedSpace)
    mockElectronAPI.space.addArtifact.mockResolvedValue(artifact)
    mockElectronAPI.space.updateArtifact.mockResolvedValue({
      ...artifact,
      status: 'ready',
    })
    mockElectronAPI.space.deleteArtifact.mockResolvedValue(undefined)
    mockElectronAPI.space.synthesize.mockResolvedValue({
      brief: 'Synthesized current understanding.',
      decisions: ['Keep suggestions transient.'],
      openQuestions: [],
      nextAction: 'Save accepted notes.',
      artifacts: [
        {
          kind: 'documentation',
          label: 'Synthesis notes',
          value: 'docs/synthesis.md',
          status: 'ready',
          sourceSessionId: 's1',
        },
      ],
    })
    mockElectronAPI.git.getBranchOutputFacts.mockResolvedValue({
      branchName: 'feature-artifact',
      upstreamBranch: 'origin/feature-artifact',
      remoteUrl: 'git@github.com:example/repo.git',
    })
    useDialogStore.setState({ openDialog: null, payload: null })
    useSpaceStore.setState({
      spaces: [],
      attemptsBySpaceId: {},
      artifactsBySpaceId: {},
      sourcesBySpaceId: {},
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
            workspaceEnvFiles: DEFAULT_PROJECT_SETTINGS.workspaceEnvFiles,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          laneOf: null,
          laneName: null,
        },
      ],
    })
    useWorkspaceStore.setState({
      globalWorkspaces: [
        {
          id: 'w1',
          projectId: 'p1',
          branchName: 'feature-artifact',
          path: '/tmp/convergence',
          type: 'worktree',
          archivedAt: null,
          worktreeRemovedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    useSessionStore.setState({
      globalSessions: [
        {
          id: 's1',
          contextKind: 'project',
          projectId: 'p1',
          workspaceId: 'w1',
          providerId: 'codex',
          model: null,
          effort: null,
          name: 'Implement artifact suggestions',
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

  it('loads Spaces when opened', async () => {
    render(<SpaceWorkboardDialogContainer />)

    openSpaces()

    await waitFor(() => {
      expect(mockElectronAPI.space.list).toHaveBeenCalled()
    })
    expect(
      await screen.findByText('Agent-native work tracking'),
    ).toBeInTheDocument()
  })

  it('creates a Space in the New Space dialog, which hands back to the board (ruling 4)', async () => {
    mockElectronAPI.space.list.mockResolvedValue([])
    render(<SpaceWorkboardDialogContainer />)

    openSpaces()
    expect(screen.queryByLabelText(/new space title/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create Space…' }))

    expect(useDialogStore.getState()).toMatchObject({
      openDialog: 'space-create',
      payload: { newSpace: { returnTo: 'space-workboard' } },
    })
    expect(mockElectronAPI.space.create).not.toHaveBeenCalled()
  })

  it('saves stable Space fields', async () => {
    render(<SpaceWorkboardDialogContainer />)

    openSpaces()
    await screen.findByText('Agent-native work tracking')
    fireEvent.change(screen.getByDisplayValue('Agent-native work tracking'), {
      target: { value: 'Spaces V1' },
    })
    selectOption('Status', 'Implementing')
    selectOption('Attention', 'Blocked')
    fireEvent.change(
      screen.getByPlaceholderText(
        /stable notes, decisions, constraints, and next action/i,
      ),
      { target: { value: 'Stable current understanding.' } },
    )

    await waitFor(() => {
      expect(mockElectronAPI.space.update).toHaveBeenCalledWith('i1', {
        title: 'Spaces V1',
        status: 'implementing',
        attention: 'blocked',
        brief: 'Stable current understanding.',
      })
    })
  })

  it('opens focused on a payload Space id', async () => {
    mockElectronAPI.space.list.mockResolvedValue([space, secondSpace])
    useDialogStore.setState({
      openDialog: 'space-workboard',
      payload: { spaceId: 'i2' },
    })

    render(<SpaceWorkboardDialogContainer />)

    expect(
      await screen.findByDisplayValue('Linked session context'),
    ).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('Show context beside the session.'),
    ).toBeInTheDocument()
  })

  it('creates a manual Artifact for the selected Space', async () => {
    render(<SpaceWorkboardDialogContainer />)

    openSpaces()
    await screen.findByText('Agent-native work tracking')
    fireEvent.click(screen.getByRole('button', { name: /add artifact/i }))
    fireEvent.change(screen.getByLabelText(/new artifact label/i), {
      target: { value: 'Public PR' },
    })
    fireEvent.change(screen.getByLabelText(/new artifact value/i), {
      target: { value: 'https://github.com/example/repo/pull/1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Artifact' }))

    await waitFor(() => {
      expect(mockElectronAPI.space.addArtifact).toHaveBeenCalledWith({
        spaceId: 'i1',
        kind: 'pull-request',
        label: 'Public PR',
        value: 'https://github.com/example/repo/pull/1',
        status: 'planned',
        sourceSessionId: null,
      })
    })
  })

  it('updates and removes manual Artifacts', async () => {
    mockElectronAPI.space.listArtifacts.mockResolvedValue([artifact])
    render(<SpaceWorkboardDialogContainer />)

    openSpaces()
    await screen.findByDisplayValue('Public PR')
    selectOption(/status for public pr/i, 'Ready')
    fireEvent.click(
      screen.getByRole('button', { name: /remove artifact public pr/i }),
    )

    await waitFor(() => {
      expect(mockElectronAPI.space.updateArtifact).toHaveBeenCalledWith('o1', {
        status: 'ready',
      })
    })
    expect(mockElectronAPI.space.deleteArtifact).toHaveBeenCalledWith('o1')
  })

  it('discovers and accepts branch Artifact suggestions', async () => {
    mockElectronAPI.space.listAttempts.mockResolvedValue([attempt])
    mockElectronAPI.space.addArtifact.mockResolvedValue({
      ...artifact,
      id: 'o2',
      kind: 'branch',
      label: 'Branch feature-artifact',
      value: 'feature-artifact',
      sourceSessionId: 's1',
      status: 'in-progress',
    })
    render(<SpaceWorkboardDialogContainer />)

    openSpaces()
    await screen.findByText('Implement artifact suggestions')
    fireEvent.click(screen.getByRole('button', { name: /discover/i }))

    expect(
      await screen.findByText('Branch feature-artifact'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /accept/i }))

    await waitFor(() => {
      expect(mockElectronAPI.space.addArtifact).toHaveBeenCalledWith({
        spaceId: 'i1',
        kind: 'branch',
        label: 'Branch feature-artifact',
        value: 'feature-artifact',
        sourceSessionId: 's1',
        status: 'in-progress',
      })
    })
  })

  it('synthesizes transient suggestions and accepts selected updates', async () => {
    mockElectronAPI.space.listAttempts.mockResolvedValue([attempt])
    render(<SpaceWorkboardDialogContainer />)

    openSpaces()
    await screen.findByText('Implement artifact suggestions')
    fireEvent.click(screen.getByRole('button', { name: /synthesize/i }))

    expect(
      await screen.findByDisplayValue('Synthesized current understanding.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /accept/i })[1])
    await waitFor(() => {
      expect(mockElectronAPI.space.addArtifact).toHaveBeenCalledWith({
        spaceId: 'i1',
        kind: 'documentation',
        label: 'Synthesis notes',
        value: 'docs/synthesis.md',
        status: 'ready',
        sourceSessionId: 's1',
      })
    })

    fireEvent.change(screen.getByLabelText(/suggested space brief/i), {
      target: { value: 'Edited synthesized understanding.' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: /accept/i })[0])

    await waitFor(() => {
      expect(mockElectronAPI.space.update).toHaveBeenCalledWith('i1', {
        title: 'Agent-native work tracking',
        status: 'exploring',
        attention: 'none',
        brief: 'Edited synthesized understanding.',
      })
    })
  })

  it('appends synthesized notes into the stable Space brief', async () => {
    mockElectronAPI.space.listAttempts.mockResolvedValue([attempt])
    mockElectronAPI.space.synthesize.mockResolvedValueOnce({
      brief: 'Leave this as a preview.',
      decisions: ['Keep suggestions transient.'],
      openQuestions: ['Should decisions become first-class later?'],
      nextAction: 'Save accepted notes.',
      artifacts: [],
    })
    render(<SpaceWorkboardDialogContainer />)

    openSpaces()
    await screen.findByText('Implement artifact suggestions')
    fireEvent.click(screen.getByRole('button', { name: /synthesize/i }))

    expect(
      await screen.findByText('Keep suggestions transient.'),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: /append to space brief/i,
      }),
    )

    await waitFor(() => {
      expect(mockElectronAPI.space.update).toHaveBeenCalledWith('i1', {
        title: 'Agent-native work tracking',
        status: 'exploring',
        attention: 'none',
        brief: [
          '## Decisions',
          '- Keep suggestions transient.',
          '',
          '## Open questions',
          '- Should decisions become first-class later?',
          '',
          '## Next action',
          'Save accepted notes.',
        ].join('\n'),
      })
    })
  })
})
