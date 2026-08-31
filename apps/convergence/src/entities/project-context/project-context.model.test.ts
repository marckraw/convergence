import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectContextStore } from './project-context.model'
import type { ProjectContextItem } from './project-context.types'

const PROJECT_ID = 'p1'
const OTHER_PROJECT_ID = 'p2'
const SESSION_ID = 's1'

const itemA: ProjectContextItem = {
  id: 'ctx-a',
  projectId: PROJECT_ID,
  label: 'monorepo',
  body: 'See ~/work/monorepo',
  reinjectMode: 'boot',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const itemB: ProjectContextItem = {
  id: 'ctx-b',
  projectId: PROJECT_ID,
  label: null,
  body: 'no-label item',
  reinjectMode: 'every-turn',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const mockElectronAPI = {
  projectContext: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    attachToSession: vi.fn(),
    listForSession: vi.fn(),
  },
}

describe('useProjectContextStore', () => {
  beforeEach(() => {
    useProjectContextStore.setState({
      itemsByProjectId: {},
      attachmentsBySessionId: {},
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

  it('loads items keyed by projectId', async () => {
    mockElectronAPI.projectContext.list.mockResolvedValue([itemA, itemB])

    await useProjectContextStore.getState().loadForProject(PROJECT_ID)

    const state = useProjectContextStore.getState()
    expect(state.itemsByProjectId[PROJECT_ID]).toEqual([itemA, itemB])
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('records an error and clears loading when load fails', async () => {
    mockElectronAPI.projectContext.list.mockRejectedValue(new Error('boom'))

    await useProjectContextStore.getState().loadForProject(PROJECT_ID)

    const state = useProjectContextStore.getState()
    expect(state.loading).toBe(false)
    expect(state.error).toBe('boom')
    expect(state.itemsByProjectId[PROJECT_ID]).toBeUndefined()
  })

  it('creates an item and inserts it into the project bucket', async () => {
    mockElectronAPI.projectContext.create.mockResolvedValue(itemA)

    const created = await useProjectContextStore.getState().createItem({
      projectId: PROJECT_ID,
      body: itemA.body,
      reinjectMode: 'boot',
    })

    expect(created).toEqual(itemA)
    expect(
      useProjectContextStore.getState().itemsByProjectId[PROJECT_ID],
    ).toEqual([itemA])
  })

  it('updates an item in place across project bucket and session attachments', async () => {
    useProjectContextStore.setState({
      itemsByProjectId: { [PROJECT_ID]: [itemA, itemB] },
      attachmentsBySessionId: { [SESSION_ID]: [itemA] },
    })
    const updated: ProjectContextItem = {
      ...itemA,
      body: 'new body',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    mockElectronAPI.projectContext.update.mockResolvedValue(updated)

    const result = await useProjectContextStore
      .getState()
      .updateItem(itemA.id, { body: 'new body' })

    expect(result).toEqual(updated)
    const state = useProjectContextStore.getState()
    expect(state.itemsByProjectId[PROJECT_ID]).toEqual([updated, itemB])
    expect(state.attachmentsBySessionId[SESSION_ID]).toEqual([updated])
  })

  it('deletes an item from project bucket and any session attachments', async () => {
    useProjectContextStore.setState({
      itemsByProjectId: { [PROJECT_ID]: [itemA, itemB] },
      attachmentsBySessionId: { [SESSION_ID]: [itemA, itemB] },
    })
    mockElectronAPI.projectContext.delete.mockResolvedValue(undefined)

    await useProjectContextStore.getState().deleteItem(itemA.id, PROJECT_ID)

    const state = useProjectContextStore.getState()
    expect(state.itemsByProjectId[PROJECT_ID]).toEqual([itemB])
    expect(state.attachmentsBySessionId[SESSION_ID]).toEqual([itemB])
  })

  it('records an error when create fails and leaves state unchanged', async () => {
    mockElectronAPI.projectContext.create.mockRejectedValue(new Error('nope'))

    const result = await useProjectContextStore.getState().createItem({
      projectId: PROJECT_ID,
      body: 'x',
      reinjectMode: 'boot',
    })

    expect(result).toBeNull()
    expect(useProjectContextStore.getState().error).toBe('nope')
    expect(
      useProjectContextStore.getState().itemsByProjectId[PROJECT_ID],
    ).toBeUndefined()
  })

  it('attachToSession refreshes the session attachments from the backend', async () => {
    mockElectronAPI.projectContext.attachToSession.mockResolvedValue(undefined)
    mockElectronAPI.projectContext.listForSession.mockResolvedValue([
      itemB,
      itemA,
    ])

    await useProjectContextStore
      .getState()
      .attachToSession(SESSION_ID, [itemB.id, itemA.id])

    expect(mockElectronAPI.projectContext.attachToSession).toHaveBeenCalledWith(
      SESSION_ID,
      [itemB.id, itemA.id],
    )
    expect(
      useProjectContextStore.getState().attachmentsBySessionId[SESSION_ID],
    ).toEqual([itemB, itemA])
  })

  it('loadForSession populates attachments for the given session', async () => {
    mockElectronAPI.projectContext.listForSession.mockResolvedValue([itemA])

    await useProjectContextStore.getState().loadForSession(SESSION_ID)

    expect(
      useProjectContextStore.getState().attachmentsBySessionId[SESSION_ID],
    ).toEqual([itemA])
  })

  it('keeps buckets isolated across projects', async () => {
    const other: ProjectContextItem = {
      ...itemA,
      id: 'o',
      projectId: OTHER_PROJECT_ID,
    }
    mockElectronAPI.projectContext.list
      .mockResolvedValueOnce([itemA])
      .mockResolvedValueOnce([other])

    await useProjectContextStore.getState().loadForProject(PROJECT_ID)
    await useProjectContextStore.getState().loadForProject(OTHER_PROJECT_ID)

    const state = useProjectContextStore.getState()
    expect(state.itemsByProjectId[PROJECT_ID]).toEqual([itemA])
    expect(state.itemsByProjectId[OTHER_PROJECT_ID]).toEqual([other])
  })

  it('clearError resets error state', () => {
    useProjectContextStore.setState({ error: 'something' })
    useProjectContextStore.getState().clearError()
    expect(useProjectContextStore.getState().error).toBeNull()
  })
})
