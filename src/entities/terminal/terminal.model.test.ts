import { describe, it, expect, beforeEach, vi } from 'vitest'

const createMock = vi.fn()
const disposeMock = vi.fn()
const layoutSaveMock = vi.fn()
const layoutGetMock = vi.fn()
const layoutClearMock = vi.fn()

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

vi.mock('./terminal-layout.api', () => ({
  terminalLayoutApi: {
    get: (...args: unknown[]) => layoutGetMock(...args),
    save: (...args: unknown[]) => layoutSaveMock(...args),
    clear: (...args: unknown[]) => layoutClearMock(...args),
  },
}))

import { useTerminalStore } from './terminal.model'
import type { LeafNode, SplitNode } from './terminal.types'
import type { PersistedPaneTree } from './terminal-layout.types'

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
      dockHeightBySessionId: {},
      dockWidthBySessionId: {},
      dockVisibleBySessionId: {},
      dockPlacementBySessionId: {},
    })
    createMock.mockReset()
    disposeMock.mockReset()
    layoutSaveMock.mockReset()
    layoutSaveMock.mockResolvedValue(undefined)
    layoutGetMock.mockReset()
    layoutClearMock.mockReset()
    layoutClearMock.mockResolvedValue(undefined)
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

  describe('dock height', () => {
    it('returns default dock height when unset', () => {
      expect(useTerminalStore.getState().getDockHeight('s1')).toBe(280)
    })

    it('clamps dock height to min 120', () => {
      useTerminalStore.getState().setDockHeight('s1', 50, 1000)
      expect(useTerminalStore.getState().getDockHeight('s1')).toBe(120)
    })

    it('clamps dock height to max (60% of window)', () => {
      useTerminalStore.getState().setDockHeight('s1', 9999, 1000)
      expect(useTerminalStore.getState().getDockHeight('s1')).toBe(600)
    })

    it('stores within-bounds dock height verbatim', () => {
      useTerminalStore.getState().setDockHeight('s1', 400, 1000)
      expect(useTerminalStore.getState().getDockHeight('s1')).toBe(400)
    })

    it('resetDockHeight sets to default 280', () => {
      useTerminalStore.getState().setDockHeight('s1', 400, 1000)
      useTerminalStore.getState().resetDockHeight('s1')
      expect(useTerminalStore.getState().getDockHeight('s1')).toBe(280)
    })
  })

  describe('dock width', () => {
    it('returns default dock width when unset', () => {
      expect(useTerminalStore.getState().getDockWidth('s1')).toBe(480)
    })

    it('clamps dock width to min 240', () => {
      useTerminalStore.getState().setDockWidth('s1', 50, 2000)
      expect(useTerminalStore.getState().getDockWidth('s1')).toBe(240)
    })

    it('clamps dock width to max (60% of window)', () => {
      useTerminalStore.getState().setDockWidth('s1', 9999, 1000)
      expect(useTerminalStore.getState().getDockWidth('s1')).toBe(600)
    })

    it('stores within-bounds dock width verbatim', () => {
      useTerminalStore.getState().setDockWidth('s1', 600, 2000)
      expect(useTerminalStore.getState().getDockWidth('s1')).toBe(600)
    })

    it('resetDockWidth sets to default 480', () => {
      useTerminalStore.getState().setDockWidth('s1', 700, 2000)
      useTerminalStore.getState().resetDockWidth('s1')
      expect(useTerminalStore.getState().getDockWidth('s1')).toBe(480)
    })
  })

  describe('dock placement', () => {
    it('returns bottom by default', () => {
      expect(useTerminalStore.getState().getDockPlacement('s1')).toBe('bottom')
    })

    it('setDockPlacement stores the value', () => {
      useTerminalStore.getState().setDockPlacement('s1', 'right')
      expect(useTerminalStore.getState().getDockPlacement('s1')).toBe('right')
    })

    it('cycleDockPlacement rotates bottom → right → left → bottom', () => {
      const store = useTerminalStore.getState()
      expect(store.cycleDockPlacement('s1')).toBe('right')
      expect(store.cycleDockPlacement('s1')).toBe('left')
      expect(store.cycleDockPlacement('s1')).toBe('bottom')
      expect(useTerminalStore.getState().getDockPlacement('s1')).toBe('bottom')
    })

    it('cycle is independent per session', () => {
      const store = useTerminalStore.getState()
      store.cycleDockPlacement('s1')
      expect(store.getDockPlacement('s1')).toBe('right')
      expect(store.getDockPlacement('s2')).toBe('bottom')
    })
  })

  describe('dock visibility', () => {
    it('returns true by default', () => {
      expect(useTerminalStore.getState().isDockVisible('s1')).toBe(true)
    })

    it('toggleDockVisible flips the value', () => {
      useTerminalStore.getState().toggleDockVisible('s1')
      expect(useTerminalStore.getState().isDockVisible('s1')).toBe(false)
      useTerminalStore.getState().toggleDockVisible('s1')
      expect(useTerminalStore.getState().isDockVisible('s1')).toBe(true)
    })
  })

  describe('layout persistence', () => {
    it('loadPersistedLayout forwards to the backend api', async () => {
      layoutGetMock.mockResolvedValueOnce(null)
      const result = await useTerminalStore.getState().loadPersistedLayout('s1')
      expect(layoutGetMock).toHaveBeenCalledWith('s1')
      expect(result).toBeNull()
    })

    it('loadPersistedLayout returns null when the api throws', async () => {
      layoutGetMock.mockRejectedValueOnce(new Error('boom'))
      const result = await useTerminalStore.getState().loadPersistedLayout('s1')
      expect(result).toBeNull()
    })

    it('restoreFromPersisted spawns one PTY per persisted tab and builds a matching tree', async () => {
      mockCreate('fresh-a')
      mockCreate('fresh-b')
      const persisted: PersistedPaneTree = {
        kind: 'split',
        id: 'split-1',
        direction: 'horizontal',
        sizes: [60, 40],
        children: [
          {
            kind: 'leaf',
            id: 'leaf-a',
            tabs: [{ id: 'old-a', cwd: '/work', title: 'zsh' }],
            activeTabId: 'old-a',
          },
          {
            kind: 'leaf',
            id: 'leaf-b',
            tabs: [{ id: 'old-b', cwd: '/work/sub', title: 'bash' }],
            activeTabId: 'old-b',
          },
        ],
      }

      const { focusedLeafId } = await useTerminalStore
        .getState()
        .restoreFromPersisted({
          sessionId: 's1',
          persisted,
          cols: 80,
          rows: 24,
        })

      expect(createMock).toHaveBeenCalledTimes(2)
      expect(createMock).toHaveBeenNthCalledWith(1, {
        sessionId: 's1',
        cwd: '/work',
        cols: 80,
        rows: 24,
      })
      expect(createMock).toHaveBeenNthCalledWith(2, {
        sessionId: 's1',
        cwd: '/work/sub',
        cols: 80,
        rows: 24,
      })

      const tree = useTerminalStore.getState().getTree('s1') as SplitNode
      expect(tree.kind).toBe('split')
      expect(tree.id).toBe('split-1')
      expect(tree.sizes).toEqual([60, 40])
      const leafA = tree.children[0] as LeafNode
      const leafB = tree.children[1] as LeafNode
      expect(leafA.id).toBe('leaf-a')
      expect(leafA.tabs[0]?.id).toBe('fresh-a')
      expect(leafA.tabs[0]?.cwd).toBe('/work')
      expect(leafA.activeTabId).toBe('fresh-a')
      expect(leafB.tabs[0]?.id).toBe('fresh-b')
      expect(focusedLeafId).toBe('leaf-a')
    })

    it('restoreFromPersisted is a no-op if a tree already exists for the session', async () => {
      mockCreate('t1')
      await useTerminalStore
        .getState()
        .openFirstPane({ sessionId: 's1', ...baseArgs })
      createMock.mockClear()

      const persisted: PersistedPaneTree = {
        kind: 'leaf',
        id: 'leaf-x',
        tabs: [{ id: 'old', cwd: '/work', title: 'zsh' }],
        activeTabId: 'old',
      }
      await useTerminalStore.getState().restoreFromPersisted({
        sessionId: 's1',
        persisted,
        cols: 80,
        rows: 24,
      })

      expect(createMock).not.toHaveBeenCalled()
    })

    it('schedules a debounced save after a mutation and sends serialized tree', async () => {
      vi.useFakeTimers()
      try {
        mockCreate('t1')
        await useTerminalStore
          .getState()
          .openFirstPane({ sessionId: 's1', ...baseArgs })

        expect(layoutSaveMock).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(300)
        expect(layoutSaveMock).toHaveBeenCalledTimes(1)
        const [sessionId, payload] = layoutSaveMock.mock.calls[0]!
        expect(sessionId).toBe('s1')
        expect(payload).toMatchObject({ kind: 'leaf' })
        expect((payload as { tabs: unknown[] }).tabs).toHaveLength(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('collapses multiple rapid mutations into a single save', async () => {
      vi.useFakeTimers()
      try {
        mockCreate('t1')
        mockCreate('t2')
        const { leafId } = await useTerminalStore
          .getState()
          .openFirstPane({ sessionId: 's1', ...baseArgs })
        await useTerminalStore
          .getState()
          .newTab({ sessionId: 's1', leafId, ...baseArgs })

        await vi.advanceTimersByTimeAsync(300)
        expect(layoutSaveMock).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('closeAllForSession clears the persisted layout instead of saving', async () => {
      vi.useFakeTimers()
      try {
        mockCreate('t1')
        await useTerminalStore
          .getState()
          .openFirstPane({ sessionId: 's1', ...baseArgs })
        await vi.advanceTimersByTimeAsync(300)
        layoutSaveMock.mockClear()
        layoutClearMock.mockClear()

        await useTerminalStore.getState().closeAllForSession('s1')
        await vi.advanceTimersByTimeAsync(300)

        expect(layoutClearMock).toHaveBeenCalledWith('s1')
        expect(layoutSaveMock).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('hydratePaneTree rebuilds the saved layout instead of creating a blank tab when one exists', async () => {
      const persisted: PersistedPaneTree = {
        kind: 'leaf',
        id: 'leaf-saved',
        tabs: [{ id: 'old-a', cwd: '/work', title: 'zsh' }],
        activeTabId: 'old-a',
      }
      layoutGetMock.mockResolvedValueOnce(persisted)
      mockCreate('fresh-a')

      const result = await useTerminalStore
        .getState()
        .hydratePaneTree({ sessionId: 's1', ...baseArgs })

      expect(result?.tab.id).toBe('fresh-a')
      const tree = useTerminalStore.getState().getTree('s1') as LeafNode
      expect(tree.id).toBe('leaf-saved')
      expect(tree.tabs[0]?.id).toBe('fresh-a')
    })

    it('hydratePaneTree falls back to openFirstPane when no layout is stored', async () => {
      layoutGetMock.mockResolvedValueOnce(null)
      mockCreate('fresh-a')

      const result = await useTerminalStore
        .getState()
        .hydratePaneTree({ sessionId: 's1', ...baseArgs })

      expect(result?.tab.id).toBe('fresh-a')
    })

    it('flushPersistedSaves drains pending saves immediately', async () => {
      vi.useFakeTimers()
      try {
        mockCreate('t1')
        await useTerminalStore
          .getState()
          .openFirstPane({ sessionId: 's1', ...baseArgs })

        expect(layoutSaveMock).not.toHaveBeenCalled()
        await useTerminalStore.getState().flushPersistedSaves()
        expect(layoutSaveMock).toHaveBeenCalledTimes(1)

        // Any pending timer should have been cancelled by the flush.
        layoutSaveMock.mockClear()
        await vi.advanceTimersByTimeAsync(300)
        expect(layoutSaveMock).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
