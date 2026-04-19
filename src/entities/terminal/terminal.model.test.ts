import { describe, it, expect, beforeEach, vi } from 'vitest'

const createMock = vi.fn()
const disposeMock = vi.fn()

vi.mock('./terminal.api', () => ({
  terminalApi: {
    create: (...args: unknown[]) => createMock(...args),
    dispose: (...args: unknown[]) => disposeMock(...args),
    attach: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  },
}))

import { useTerminalStore } from './terminal.model'
import type { LeafNode, SplitNode } from './terminal.types'

function mockCreate(id: string, pid = 1000) {
  createMock.mockResolvedValueOnce({
    id,
    pid,
    shell: '/bin/zsh',
    initialBuffer: '',
  })
}

const baseArgs = { cwd: '/tmp', cols: 80, rows: 24 }

describe('terminal store', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      treesBySessionId: {},
      focusedLeafBySessionId: {},
    })
    createMock.mockReset()
    disposeMock.mockReset()
  })

  describe('openFirstPane', () => {
    it('creates a tree with one leaf and one tab', async () => {
      mockCreate('t1')
      const { leafId, tab } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      expect(tab.id).toBe('t1')
      expect(tab.status).toBe('running')
      const tree = useTerminalStore.getState().getTree('s1') as LeafNode
      expect(tree.kind).toBe('leaf')
      expect(tree.id).toBe(leafId)
      expect(tree.tabs.map((t) => t.id)).toEqual(['t1'])
      expect(tree.activeTabId).toBe('t1')
      expect(useTerminalStore.getState().focusedLeafBySessionId['s1']).toBe(
        leafId,
      )
      expect(createMock).toHaveBeenCalledWith({ sessionId: 's1', ...baseArgs })
    })

    it('returns the focused leaf active tab without creating another PTY', async () => {
      mockCreate('t1')
      const first = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      const second = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      expect(second.leafId).toBe(first.leafId)
      expect(second.tab.id).toBe('t1')
      expect(createMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('newTab', () => {
    it('inserts a tab into the target leaf and activates it', async () => {
      mockCreate('t1')
      const { leafId } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      mockCreate('t2', 1001)
      const tab = await useTerminalStore.getState().newTab({
        sessionId: 's1',
        leafId,
        ...baseArgs,
      })
      expect(tab.id).toBe('t2')
      const tree = useTerminalStore.getState().getTree('s1') as LeafNode
      expect(tree.tabs.map((t) => t.id)).toEqual(['t1', 't2'])
      expect(tree.activeTabId).toBe('t2')
    })
  })

  describe('splitLeaf', () => {
    it('wraps the leaf in a split, creates a new leaf, and focuses it', async () => {
      mockCreate('t1')
      const { leafId } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      mockCreate('t2', 1001)
      const { leafId: newLeafId, tab } = await useTerminalStore
        .getState()
        .splitLeaf({
          sessionId: 's1',
          leafId,
          direction: 'horizontal',
          ...baseArgs,
        })
      expect(tab.id).toBe('t2')
      expect(newLeafId).not.toBe(leafId)
      const tree = useTerminalStore.getState().getTree('s1') as SplitNode
      expect(tree.kind).toBe('split')
      expect(tree.direction).toBe('horizontal')
      expect(tree.sizes).toEqual([50, 50])
      expect(tree.children.map((c) => c.id)).toEqual([leafId, newLeafId])
      expect(useTerminalStore.getState().focusedLeafBySessionId['s1']).toBe(
        newLeafId,
      )
    })
  })

  describe('closeTab', () => {
    it('removes the tab and disposes the PTY', async () => {
      mockCreate('t1')
      const { leafId } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      mockCreate('t2', 1001)
      await useTerminalStore.getState().newTab({
        sessionId: 's1',
        leafId,
        ...baseArgs,
      })
      disposeMock.mockResolvedValueOnce(undefined)
      await useTerminalStore.getState().closeTab('s1', leafId, 't1')
      expect(disposeMock).toHaveBeenCalledWith('t1')
      const tree = useTerminalStore.getState().getTree('s1') as LeafNode
      expect(tree.tabs.map((t) => t.id)).toEqual(['t2'])
    })

    it('closing the last tab collapses the tree to null and disposes', async () => {
      mockCreate('t1')
      const { leafId } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      disposeMock.mockResolvedValueOnce(undefined)
      await useTerminalStore.getState().closeTab('s1', leafId, 't1')
      expect(disposeMock).toHaveBeenCalledWith('t1')
      expect(useTerminalStore.getState().getTree('s1')).toBeNull()
    })

    it('swallows dispose errors (PTY already exited)', async () => {
      mockCreate('t1')
      const { leafId } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      disposeMock.mockRejectedValueOnce(new Error('already disposed'))
      await expect(
        useTerminalStore.getState().closeTab('s1', leafId, 't1'),
      ).resolves.toBeUndefined()
    })
  })

  describe('closeAllForSession', () => {
    it('disposes every PTY across splits and clears the tree', async () => {
      mockCreate('t1')
      const { leafId } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      mockCreate('t2', 1001)
      await useTerminalStore.getState().newTab({
        sessionId: 's1',
        leafId,
        ...baseArgs,
      })
      mockCreate('t3', 1002)
      await useTerminalStore.getState().splitLeaf({
        sessionId: 's1',
        leafId,
        direction: 'vertical',
        ...baseArgs,
      })
      disposeMock.mockResolvedValue(undefined)
      await useTerminalStore.getState().closeAllForSession('s1')
      expect(disposeMock).toHaveBeenCalledTimes(3)
      const disposed = disposeMock.mock.calls.map((c) => c[0]).sort()
      expect(disposed).toEqual(['t1', 't2', 't3'])
      expect(useTerminalStore.getState().getTree('s1')).toBeNull()
      expect(
        useTerminalStore.getState().focusedLeafBySessionId['s1'],
      ).toBeNull()
    })
  })

  describe('setActiveTab', () => {
    it('changes the active tab within a leaf', async () => {
      mockCreate('t1')
      const { leafId } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      mockCreate('t2', 1001)
      await useTerminalStore.getState().newTab({
        sessionId: 's1',
        leafId,
        ...baseArgs,
      })
      useTerminalStore.getState().setActiveTab('s1', leafId, 't1')
      const tree = useTerminalStore.getState().getTree('s1') as LeafNode
      expect(tree.activeTabId).toBe('t1')
    })
  })

  describe('setFocusedLeaf', () => {
    it('updates the focused leaf for the session', async () => {
      mockCreate('t1')
      const { leafId } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      useTerminalStore.getState().setFocusedLeaf('s1', leafId)
      expect(useTerminalStore.getState().focusedLeafBySessionId['s1']).toBe(
        leafId,
      )
    })
  })

  describe('resizeSplit', () => {
    it('updates and normalizes split sizes', async () => {
      mockCreate('t1')
      const { leafId } = await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      mockCreate('t2', 1001)
      await useTerminalStore.getState().splitLeaf({
        sessionId: 's1',
        leafId,
        direction: 'horizontal',
        ...baseArgs,
      })
      const tree = useTerminalStore.getState().getTree('s1') as SplitNode
      useTerminalStore.getState().resizeSplit('s1', tree.id, [30, 70])
      const next = useTerminalStore.getState().getTree('s1') as SplitNode
      expect(next.sizes[0]! + next.sizes[1]!).toBeCloseTo(100, 5)
      expect(next.sizes[0]).toBeCloseTo(30, 5)
    })
  })

  describe('markTabExited', () => {
    it('marks the tab exited with the provided exit code', async () => {
      mockCreate('t1')
      await useTerminalStore.getState().openFirstPane({
        sessionId: 's1',
        ...baseArgs,
      })
      useTerminalStore.getState().markTabExited('s1', 't1', 137)
      const tab = useTerminalStore.getState().getTab('s1', 't1')
      expect(tab).toMatchObject({ status: 'exited', exitCode: 137 })
    })
  })
})
