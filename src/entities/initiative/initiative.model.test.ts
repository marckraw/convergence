import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInitiativeStore } from './initiative.model'
import type {
  Initiative,
  InitiativeAttempt,
  InitiativeOutput,
} from './initiative.types'

const initiative: Initiative = {
  id: 'i1',
  title: 'Agent-native initiatives',
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

const output: InitiativeOutput = {
  id: 'o1',
  initiativeId: 'i1',
  kind: 'pull-request',
  label: 'PR',
  value: 'https://example.com/pr/1',
  sourceSessionId: 's1',
  status: 'planned',
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
    linkAttempt: vi.fn(),
    updateAttempt: vi.fn(),
    unlinkAttempt: vi.fn(),
    setPrimaryAttempt: vi.fn(),
    listOutputs: vi.fn(),
    addOutput: vi.fn(),
    updateOutput: vi.fn(),
    deleteOutput: vi.fn(),
  },
}

describe('useInitiativeStore', () => {
  beforeEach(() => {
    useInitiativeStore.setState({
      initiatives: [],
      attemptsByInitiativeId: {},
      outputsByInitiativeId: {},
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

  it('loads initiatives', async () => {
    mockElectronAPI.initiative.list.mockResolvedValue([initiative])

    await useInitiativeStore.getState().loadInitiatives()

    expect(useInitiativeStore.getState().initiatives).toEqual([initiative])
    expect(useInitiativeStore.getState().loading).toBe(false)
  })

  it('creates and updates initiatives', async () => {
    mockElectronAPI.initiative.create.mockResolvedValue(initiative)
    mockElectronAPI.initiative.update.mockResolvedValue({
      ...initiative,
      status: 'implementing',
    })

    const created = await useInitiativeStore
      .getState()
      .createInitiative({ title: initiative.title })
    const updated = await useInitiativeStore
      .getState()
      .updateInitiative(initiative.id, { status: 'implementing' })

    expect(created).toEqual(initiative)
    expect(updated?.status).toBe('implementing')
    expect(useInitiativeStore.getState().initiatives).toEqual([
      { ...initiative, status: 'implementing' },
    ])
  })

  it('loads and links attempts', async () => {
    mockElectronAPI.initiative.listAttempts.mockResolvedValue([attempt])
    mockElectronAPI.initiative.linkAttempt.mockResolvedValue(attempt)

    await useInitiativeStore.getState().loadAttempts(initiative.id)
    await useInitiativeStore.getState().linkAttempt({
      initiativeId: initiative.id,
      sessionId: attempt.sessionId,
      role: 'seed',
    })

    expect(
      useInitiativeStore.getState().attemptsByInitiativeId[initiative.id],
    ).toEqual([attempt])
  })

  it('refreshes attempts when setting primary', async () => {
    const secondAttempt: InitiativeAttempt = {
      ...attempt,
      id: 'a2',
      sessionId: 's2',
      isPrimary: true,
    }
    mockElectronAPI.initiative.setPrimaryAttempt.mockResolvedValue(
      secondAttempt,
    )
    mockElectronAPI.initiative.listAttempts.mockResolvedValue([
      { ...attempt, isPrimary: false },
      secondAttempt,
    ])

    const result = await useInitiativeStore
      .getState()
      .setPrimaryAttempt(initiative.id, secondAttempt.id)

    expect(result).toEqual(secondAttempt)
    expect(
      useInitiativeStore
        .getState()
        .attemptsByInitiativeId[initiative.id].filter((item) => item.isPrimary),
    ).toEqual([secondAttempt])
  })

  it('manages outputs', async () => {
    mockElectronAPI.initiative.listOutputs.mockResolvedValue([output])
    mockElectronAPI.initiative.addOutput.mockResolvedValue(output)
    mockElectronAPI.initiative.updateOutput.mockResolvedValue({
      ...output,
      status: 'merged',
    })
    mockElectronAPI.initiative.deleteOutput.mockResolvedValue(undefined)

    await useInitiativeStore.getState().loadOutputs(initiative.id)
    await useInitiativeStore.getState().addOutput({
      initiativeId: initiative.id,
      kind: output.kind,
      label: output.label,
      value: output.value,
    })
    await useInitiativeStore
      .getState()
      .updateOutput(output.id, initiative.id, { status: 'merged' })

    expect(
      useInitiativeStore.getState().outputsByInitiativeId[initiative.id],
    ).toEqual([{ ...output, status: 'merged' }])

    await useInitiativeStore.getState().deleteOutput(output.id, initiative.id)
    expect(
      useInitiativeStore.getState().outputsByInitiativeId[initiative.id],
    ).toEqual([])
  })

  it('sets error on failures', async () => {
    mockElectronAPI.initiative.list.mockRejectedValue(new Error('boom'))

    await useInitiativeStore.getState().loadInitiatives()

    expect(useInitiativeStore.getState().error).toBe('boom')
  })
})
