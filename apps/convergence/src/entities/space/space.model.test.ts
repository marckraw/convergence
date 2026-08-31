import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpaceStore } from './space.model'
import type {
  Space,
  SpaceAttempt,
  SpaceArtifact,
  SpaceSource,
} from './space.types'

const space: Space = {
  id: 'i1',
  title: 'Agent-native spaces',
  status: 'exploring',
  attention: 'none',
  brief: '',
  memory: '',
  archivedAt: null,
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

const artifact: SpaceArtifact = {
  id: 'o1',
  spaceId: 'i1',
  kind: 'pull-request',
  label: 'PR',
  value: 'https://example.com/pr/1',
  sourceSessionId: 's1',
  status: 'planned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const source: SpaceSource = {
  id: 'source-1',
  spaceId: 'i1',
  filename: 'notes.md',
  originalPath: '/tmp/notes.md',
  storagePath: '/tmp/spaces/i1/sources/source-1-notes.md',
  sizeBytes: 128,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const mockElectronAPI = {
  space: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    delete: vi.fn(),
    listAttempts: vi.fn(),
    listAttemptsForSession: vi.fn(),
    linkAttempt: vi.fn(),
    updateAttempt: vi.fn(),
    unlinkAttempt: vi.fn(),
    setPrimaryAttempt: vi.fn(),
    listArtifacts: vi.fn(),
    addArtifact: vi.fn(),
    addArtifactsFromPaths: vi.fn(),
    updateArtifact: vi.fn(),
    deleteArtifact: vi.fn(),
    listSources: vi.fn(),
    addSourcesFromPaths: vi.fn(),
    deleteSource: vi.fn(),
    showSourceOpenDialog: vi.fn(),
    showArtifactOpenDialog: vi.fn(),
    synthesize: vi.fn(),
  },
}

describe('useSpaceStore', () => {
  beforeEach(() => {
    useSpaceStore.setState({
      spaces: [],
      attemptsBySpaceId: {},
      attemptsBySessionId: {},
      artifactsBySpaceId: {},
      sourcesBySpaceId: {},
      loading: false,
      error: null,
    })
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'window', {
      value: { electronAPI: mockElectronAPI },
      writable: true,
      configurable: true,
    })
  })

  it('loads spaces', async () => {
    mockElectronAPI.space.list.mockResolvedValue([space])

    await useSpaceStore.getState().loadSpaces()

    expect(useSpaceStore.getState().spaces).toEqual([space])
    expect(useSpaceStore.getState().loading).toBe(false)
  })

  it('creates and updates spaces', async () => {
    mockElectronAPI.space.create.mockResolvedValue(space)
    mockElectronAPI.space.update.mockResolvedValue({
      ...space,
      status: 'implementing',
    })

    const created = await useSpaceStore
      .getState()
      .createSpace({ title: space.title })
    const updated = await useSpaceStore
      .getState()
      .updateSpace(space.id, { status: 'implementing' })

    expect(created).toEqual(space)
    expect(updated?.status).toBe('implementing')
    expect(useSpaceStore.getState().spaces).toEqual([
      { ...space, status: 'implementing' },
    ])
  })

  it('archives and unarchives spaces', async () => {
    mockElectronAPI.space.archive.mockResolvedValue({
      ...space,
      archivedAt: '2026-01-02T00:00:00.000Z',
    })
    mockElectronAPI.space.unarchive.mockResolvedValue({
      ...space,
      archivedAt: null,
    })

    const archived = await useSpaceStore.getState().archiveSpace(space.id)
    const unarchived = await useSpaceStore.getState().unarchiveSpace(space.id)

    expect(archived?.archivedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(unarchived?.archivedAt).toBeNull()
    expect(useSpaceStore.getState().spaces).toEqual([
      { ...space, archivedAt: null },
    ])
  })

  it('loads and links attempts', async () => {
    mockElectronAPI.space.listAttempts.mockResolvedValue([attempt])
    mockElectronAPI.space.listAttemptsForSession.mockResolvedValue([attempt])
    mockElectronAPI.space.linkAttempt.mockResolvedValue(attempt)

    await useSpaceStore.getState().loadAttempts(space.id)
    await useSpaceStore.getState().loadAttemptsForSession(attempt.sessionId)
    await useSpaceStore.getState().linkAttempt({
      spaceId: space.id,
      sessionId: attempt.sessionId,
      role: 'seed',
    })

    expect(useSpaceStore.getState().attemptsBySpaceId[space.id]).toEqual([
      attempt,
    ])
    expect(
      useSpaceStore.getState().attemptsBySessionId[attempt.sessionId],
    ).toEqual([attempt])
  })

  it('refreshes attempts when setting primary', async () => {
    const secondAttempt: SpaceAttempt = {
      ...attempt,
      id: 'a2',
      sessionId: 's2',
      isPrimary: true,
    }
    mockElectronAPI.space.setPrimaryAttempt.mockResolvedValue(secondAttempt)
    mockElectronAPI.space.listAttempts.mockResolvedValue([
      { ...attempt, isPrimary: false },
      secondAttempt,
    ])

    const result = await useSpaceStore
      .getState()
      .setPrimaryAttempt(space.id, secondAttempt.id)

    expect(result).toEqual(secondAttempt)
    expect(
      useSpaceStore
        .getState()
        .attemptsBySpaceId[space.id].filter((item) => item.isPrimary),
    ).toEqual([secondAttempt])
  })

  it('manages artifacts', async () => {
    const fileArtifact: SpaceArtifact = {
      ...artifact,
      id: 'o2',
      kind: 'documentation',
      label: 'notes.md',
      value: '/tmp/spaces/i1/artifacts/o2-notes.md',
      sourceSessionId: null,
      status: 'ready',
    }
    mockElectronAPI.space.listArtifacts.mockResolvedValue([artifact])
    mockElectronAPI.space.addArtifact.mockResolvedValue(artifact)
    mockElectronAPI.space.addArtifactsFromPaths.mockResolvedValue([
      fileArtifact,
    ])
    mockElectronAPI.space.updateArtifact.mockResolvedValue({
      ...artifact,
      status: 'merged',
    })
    mockElectronAPI.space.deleteArtifact.mockResolvedValue(undefined)

    await useSpaceStore.getState().loadArtifacts(space.id)
    await useSpaceStore.getState().addArtifact({
      spaceId: space.id,
      kind: artifact.kind,
      label: artifact.label,
      value: artifact.value,
    })
    await useSpaceStore.getState().addArtifactsFromPaths({
      spaceId: space.id,
      paths: ['/tmp/notes.md'],
    })
    await useSpaceStore
      .getState()
      .updateArtifact(artifact.id, space.id, { status: 'merged' })

    expect(useSpaceStore.getState().artifactsBySpaceId[space.id]).toEqual([
      fileArtifact,
      { ...artifact, status: 'merged' },
    ])

    await useSpaceStore.getState().deleteArtifact(artifact.id, space.id)
    await useSpaceStore.getState().deleteArtifact(fileArtifact.id, space.id)
    expect(useSpaceStore.getState().artifactsBySpaceId[space.id]).toEqual([])
  })

  it('manages file-backed sources', async () => {
    mockElectronAPI.space.listSources.mockResolvedValue([source])
    mockElectronAPI.space.addSourcesFromPaths.mockResolvedValue([source])
    mockElectronAPI.space.deleteSource.mockResolvedValue(undefined)

    await useSpaceStore.getState().loadSources(space.id)
    await useSpaceStore
      .getState()
      .addSourcesFromPaths(space.id, [source.originalPath])

    expect(useSpaceStore.getState().sourcesBySpaceId[space.id]).toEqual([
      source,
    ])

    await useSpaceStore.getState().deleteSource(source.id, space.id)
    expect(useSpaceStore.getState().sourcesBySpaceId[space.id]).toEqual([])
  })

  it('sets error on failures', async () => {
    mockElectronAPI.space.list.mockRejectedValue(new Error('boom'))

    await useSpaceStore.getState().loadSpaces()

    expect(useSpaceStore.getState().error).toBe('boom')
  })

  it('runs synthesis without mutating stable state', async () => {
    const synthesis = {
      brief: 'Synthesized understanding',
      decisions: ['Keep it transient.'],
      openQuestions: [],
      nextAction: 'Save accepted changes.',
      artifacts: [],
    }
    mockElectronAPI.space.synthesize.mockResolvedValue(synthesis)

    const result = await useSpaceStore
      .getState()
      .synthesize(space.id, 'request-1')

    expect(result).toEqual(synthesis)
    expect(mockElectronAPI.space.synthesize).toHaveBeenCalledWith(
      space.id,
      'request-1',
    )
    expect(useSpaceStore.getState().spaces).toEqual([])
  })
})
