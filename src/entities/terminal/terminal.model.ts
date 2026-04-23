import { create } from 'zustand'
import { terminalApi } from './terminal.api'
import { terminalLayoutApi } from './terminal-layout.api'
import type {
  LeafNode,
  PaneTree,
  SplitDirection,
  SplitNode,
  TerminalTab,
} from './terminal.types'
import type {
  PersistedLeaf,
  PersistedPaneTree,
} from './terminal-layout.types'
import { serializePaneTree } from './terminal-layout.pure'
import {
  collectAllPtyIds,
  findLeaf,
  insertTab,
  makeLeaf,
  removeTab,
  setActiveTab as setActiveTabPure,
  splitLeaf as splitLeafPure,
  updateSizes,
} from './pane-tree.pure'

interface TerminalState {
  treesBySessionId: Record<string, PaneTree | null>
  focusedLeafBySessionId: Record<string, string | null>
  dockHeightBySessionId: Record<string, number>
  dockVisibleBySessionId: Record<string, boolean>
}

export const DEFAULT_DOCK_HEIGHT = 280
export const MIN_DOCK_HEIGHT = 120
export const DOCK_MAX_HEIGHT_RATIO = 0.6

export function clampDockHeight(
  height: number,
  maxWindowHeight: number,
): number {
  const max = Math.max(
    MIN_DOCK_HEIGHT,
    Math.floor(maxWindowHeight * DOCK_MAX_HEIGHT_RATIO),
  )
  return Math.min(Math.max(height, MIN_DOCK_HEIGHT), max)
}

interface OpenFirstPaneArgs {
  sessionId: string
  cwd: string
  cols: number
  rows: number
}

interface NewTabArgs {
  sessionId: string
  leafId: string
  cwd: string
  cols: number
  rows: number
}

interface SplitLeafArgs {
  sessionId: string
  leafId: string
  direction: SplitDirection
  cwd: string
  cols: number
  rows: number
}

interface RestoreFromPersistedArgs {
  sessionId: string
  persisted: PersistedPaneTree
  cols: number
  rows: number
}

interface TerminalActions {
  openFirstPane: (
    args: OpenFirstPaneArgs,
  ) => Promise<{ leafId: string; tab: TerminalTab }>
  newTab: (args: NewTabArgs) => Promise<TerminalTab>
  splitLeaf: (
    args: SplitLeafArgs,
  ) => Promise<{ leafId: string; tab: TerminalTab }>
  closeTab: (sessionId: string, leafId: string, tabId: string) => Promise<void>
  closeAllForSession: (sessionId: string) => Promise<void>
  setActiveTab: (sessionId: string, leafId: string, tabId: string) => void
  setFocusedLeaf: (sessionId: string, leafId: string) => void
  resizeSplit: (sessionId: string, splitId: string, sizes: number[]) => void
  markTabExited: (sessionId: string, tabId: string, exitCode: number) => void
  setDockHeight: (
    sessionId: string,
    height: number,
    maxWindowHeight: number,
  ) => void
  resetDockHeight: (sessionId: string) => void
  getDockHeight: (sessionId: string) => number
  toggleDockVisible: (sessionId: string) => void
  setDockVisible: (sessionId: string, visible: boolean) => void
  isDockVisible: (sessionId: string) => boolean
  getTree: (sessionId: string) => PaneTree | null
  getTab: (sessionId: string, tabId: string) => TerminalTab | null
  loadPersistedLayout: (sessionId: string) => Promise<PersistedPaneTree | null>
  restoreFromPersisted: (
    args: RestoreFromPersistedArgs,
  ) => Promise<{ focusedLeafId: string | null }>
  hydratePaneTree: (
    args: OpenFirstPaneArgs,
  ) => Promise<{ leafId: string; tab: TerminalTab } | null>
  flushPersistedSaves: () => Promise<void>
}

export type TerminalStore = TerminalState & TerminalActions

let idCounter = 0
const nextId = (prefix: string) => `${prefix}-${++idCounter}-${Date.now()}`

const PERSIST_DEBOUNCE_MS = 300

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingSessions = new Set<string>()

function getTreeForSession(sessionId: string): PaneTree | null {
  return useTerminalStore.getState().treesBySessionId[sessionId] ?? null
}

async function persistSessionNow(sessionId: string): Promise<void> {
  pendingSessions.delete(sessionId)
  const tree = getTreeForSession(sessionId)
  try {
    if (tree) {
      await terminalLayoutApi.save(sessionId, serializePaneTree(tree))
    } else {
      await terminalLayoutApi.clear(sessionId)
    }
  } catch {
    // Persistence is best-effort; a failed save is not fatal. The next
    // mutation will attempt another save, and app quit replays from the
    // saved-at-mutation snapshot regardless.
  }
}

function schedulePersistSave(sessionId: string): void {
  pendingSessions.add(sessionId)
  const existing = persistTimers.get(sessionId)
  if (existing) clearTimeout(existing)
  const handle = setTimeout(() => {
    persistTimers.delete(sessionId)
    void persistSessionNow(sessionId)
  }, PERSIST_DEBOUNCE_MS)
  persistTimers.set(sessionId, handle)
}

async function flushAllPendingSaves(): Promise<void> {
  const ids = Array.from(pendingSessions)
  for (const sessionId of ids) {
    const timer = persistTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      persistTimers.delete(sessionId)
    }
    await persistSessionNow(sessionId)
  }
}

function findTabInTree(tree: PaneTree, tabId: string): TerminalTab | null {
  if (tree.kind === 'leaf') {
    return tree.tabs.find((t) => t.id === tabId) ?? null
  }
  for (const child of tree.children) {
    const found = findTabInTree(child, tabId)
    if (found) return found
  }
  return null
}

function updateTabInTree(
  tree: PaneTree,
  tabId: string,
  updater: (tab: TerminalTab) => TerminalTab,
): PaneTree {
  if (tree.kind === 'leaf') {
    if (!tree.tabs.some((t) => t.id === tabId)) return tree
    return {
      ...tree,
      tabs: tree.tabs.map((t) => (t.id === tabId ? updater(t) : t)),
    }
  }
  let changed = false
  const children = tree.children.map((child) => {
    const next = updateTabInTree(child, tabId, updater)
    if (next !== child) changed = true
    return next
  })
  return changed ? { ...tree, children } : tree
}

function toTab(
  result: { id: string; pid: number; shell: string },
  cwd: string,
): TerminalTab {
  return {
    id: result.id,
    cwd,
    title: basename(result.shell),
    pid: result.pid,
    shell: result.shell,
    status: 'running',
    exitCode: null,
  }
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  treesBySessionId: {},
  focusedLeafBySessionId: {},
  dockHeightBySessionId: {},
  dockVisibleBySessionId: {},

  getTree: (sessionId) => get().treesBySessionId[sessionId] ?? null,

  getTab: (sessionId, tabId) => {
    const tree = get().treesBySessionId[sessionId]
    if (!tree) return null
    return findTabInTree(tree, tabId)
  },

  openFirstPane: async ({ sessionId, cwd, cols, rows }) => {
    const existing = get().treesBySessionId[sessionId]
    if (existing) {
      const focusedLeafId = get().focusedLeafBySessionId[sessionId] ?? null
      if (focusedLeafId) {
        const found = findLeaf(existing, focusedLeafId)
        if (found) {
          const activeTab = found.leaf.tabs.find(
            (t) => t.id === found.leaf.activeTabId,
          )
          if (activeTab) {
            return { leafId: found.leaf.id, tab: activeTab }
          }
        }
      }
    }

    const result = await terminalApi.create({ sessionId, cwd, cols, rows })
    const tab = toTab(result, cwd)
    const leafId = nextId('leaf')
    const leaf = makeLeaf(leafId, tab)
    set((state) => ({
      treesBySessionId: { ...state.treesBySessionId, [sessionId]: leaf },
      focusedLeafBySessionId: {
        ...state.focusedLeafBySessionId,
        [sessionId]: leafId,
      },
    }))
    schedulePersistSave(sessionId)
    return { leafId, tab }
  },

  newTab: async ({ sessionId, leafId, cwd, cols, rows }) => {
    const result = await terminalApi.create({ sessionId, cwd, cols, rows })
    const tab = toTab(result, cwd)
    set((state) => {
      const tree = state.treesBySessionId[sessionId]
      if (!tree) return state
      return {
        treesBySessionId: {
          ...state.treesBySessionId,
          [sessionId]: insertTab(tree, leafId, tab),
        },
      }
    })
    schedulePersistSave(sessionId)
    return tab
  },

  splitLeaf: async ({ sessionId, leafId, direction, cwd, cols, rows }) => {
    const result = await terminalApi.create({ sessionId, cwd, cols, rows })
    const tab = toTab(result, cwd)
    const newLeafId = nextId('leaf')
    const newLeaf: LeafNode = makeLeaf(newLeafId, tab)
    const splitId = nextId('split')
    set((state) => {
      const tree = state.treesBySessionId[sessionId]
      if (!tree) return state
      return {
        treesBySessionId: {
          ...state.treesBySessionId,
          [sessionId]: splitLeafPure(tree, leafId, direction, newLeaf, splitId),
        },
        focusedLeafBySessionId: {
          ...state.focusedLeafBySessionId,
          [sessionId]: newLeafId,
        },
      }
    })
    schedulePersistSave(sessionId)
    return { leafId: newLeafId, tab }
  },

  closeTab: async (sessionId, leafId, tabId) => {
    const tree = get().treesBySessionId[sessionId]
    if (!tree) return
    const { tree: nextTree, ptyIdsToDispose } = removeTab(tree, leafId, tabId)
    set((state) => ({
      treesBySessionId: { ...state.treesBySessionId, [sessionId]: nextTree },
    }))
    schedulePersistSave(sessionId)
    for (const id of ptyIdsToDispose) {
      try {
        await terminalApi.dispose(id)
      } catch {
        // backend already tore down the PTY (e.g. shell exited just before close)
      }
    }
  },

  closeAllForSession: async (sessionId) => {
    const tree = get().treesBySessionId[sessionId]
    if (!tree) return
    const ids = collectAllPtyIds(tree)
    set((state) => ({
      treesBySessionId: { ...state.treesBySessionId, [sessionId]: null },
      focusedLeafBySessionId: {
        ...state.focusedLeafBySessionId,
        [sessionId]: null,
      },
    }))
    schedulePersistSave(sessionId)
    for (const id of ids) {
      try {
        await terminalApi.dispose(id)
      } catch {
        // PTY already gone (e.g. shell exited)
      }
    }
  },

  setActiveTab: (sessionId, leafId, tabId) => {
    set((state) => {
      const tree = state.treesBySessionId[sessionId]
      if (!tree) return state
      return {
        treesBySessionId: {
          ...state.treesBySessionId,
          [sessionId]: setActiveTabPure(tree, leafId, tabId),
        },
      }
    })
    schedulePersistSave(sessionId)
  },

  setFocusedLeaf: (sessionId, leafId) => {
    set((state) => ({
      focusedLeafBySessionId: {
        ...state.focusedLeafBySessionId,
        [sessionId]: leafId,
      },
    }))
  },

  resizeSplit: (sessionId, splitId, sizes) => {
    set((state) => {
      const tree = state.treesBySessionId[sessionId]
      if (!tree) return state
      return {
        treesBySessionId: {
          ...state.treesBySessionId,
          [sessionId]: updateSizes(tree, splitId, sizes),
        },
      }
    })
    schedulePersistSave(sessionId)
  },

  setDockHeight: (sessionId, height, maxWindowHeight) => {
    const clamped = clampDockHeight(height, maxWindowHeight)
    set((state) => ({
      dockHeightBySessionId: {
        ...state.dockHeightBySessionId,
        [sessionId]: clamped,
      },
    }))
  },

  resetDockHeight: (sessionId) => {
    set((state) => ({
      dockHeightBySessionId: {
        ...state.dockHeightBySessionId,
        [sessionId]: DEFAULT_DOCK_HEIGHT,
      },
    }))
  },

  getDockHeight: (sessionId) =>
    get().dockHeightBySessionId[sessionId] ?? DEFAULT_DOCK_HEIGHT,

  toggleDockVisible: (sessionId) => {
    set((state) => ({
      dockVisibleBySessionId: {
        ...state.dockVisibleBySessionId,
        [sessionId]: !(state.dockVisibleBySessionId[sessionId] ?? true),
      },
    }))
  },

  setDockVisible: (sessionId, visible) => {
    set((state) => ({
      dockVisibleBySessionId: {
        ...state.dockVisibleBySessionId,
        [sessionId]: visible,
      },
    }))
  },

  isDockVisible: (sessionId) => get().dockVisibleBySessionId[sessionId] ?? true,

  markTabExited: (sessionId, tabId, exitCode) => {
    set((state) => {
      const tree = state.treesBySessionId[sessionId]
      if (!tree) return state
      return {
        treesBySessionId: {
          ...state.treesBySessionId,
          [sessionId]: updateTabInTree(tree, tabId, (tab) => ({
            ...tab,
            status: 'exited',
            exitCode,
          })),
        },
      }
    })
  },

  loadPersistedLayout: async (sessionId) => {
    try {
      return await terminalLayoutApi.get(sessionId)
    } catch {
      return null
    }
  },

  restoreFromPersisted: async ({ sessionId, persisted, cols, rows }) => {
    const existing = get().treesBySessionId[sessionId]
    if (existing) {
      const focused = get().focusedLeafBySessionId[sessionId] ?? null
      return { focusedLeafId: focused }
    }

    let firstLeafId: string | null = null
    const tree = await rebuildTreeFromPersisted(persisted, sessionId, cols, rows, (leafId) => {
      if (!firstLeafId) firstLeafId = leafId
    })

    set((state) => ({
      treesBySessionId: { ...state.treesBySessionId, [sessionId]: tree },
      focusedLeafBySessionId: {
        ...state.focusedLeafBySessionId,
        [sessionId]: firstLeafId,
      },
    }))
    // Persist right away so the freshly-allocated PTY ids replace the old
    // ones in the stored snapshot — next restore uses the new ids.
    schedulePersistSave(sessionId)

    return { focusedLeafId: firstLeafId }
  },

  hydratePaneTree: async ({ sessionId, cwd, cols, rows }) => {
    const state = get()
    const existing = state.treesBySessionId[sessionId]
    if (existing) {
      const focusedLeafId = state.focusedLeafBySessionId[sessionId] ?? null
      if (focusedLeafId) {
        const found = findLeaf(existing, focusedLeafId)
        if (found) {
          const activeTab = found.leaf.tabs.find(
            (t) => t.id === found.leaf.activeTabId,
          )
          if (activeTab) return { leafId: found.leaf.id, tab: activeTab }
        }
      }
      return null
    }

    const persisted = await get().loadPersistedLayout(sessionId)
    if (persisted) {
      await get().restoreFromPersisted({
        sessionId,
        persisted,
        cols,
        rows,
      })
      const refreshed = get()
      const tree = refreshed.treesBySessionId[sessionId]
      const focusedLeafId = refreshed.focusedLeafBySessionId[sessionId] ?? null
      if (tree && focusedLeafId) {
        const found = findLeaf(tree, focusedLeafId)
        if (found) {
          const activeTab = found.leaf.tabs.find(
            (t) => t.id === found.leaf.activeTabId,
          )
          if (activeTab) return { leafId: found.leaf.id, tab: activeTab }
        }
      }
      return null
    }

    return get().openFirstPane({ sessionId, cwd, cols, rows })
  },

  flushPersistedSaves: () => flushAllPendingSaves(),
}))

async function rebuildTreeFromPersisted(
  persisted: PersistedPaneTree,
  sessionId: string,
  cols: number,
  rows: number,
  onLeafBuilt: (leafId: string) => void,
): Promise<PaneTree> {
  if (persisted.kind === 'leaf') {
    return rebuildLeafFromPersisted(persisted, sessionId, cols, rows, onLeafBuilt)
  }
  const children: PaneTree[] = []
  for (const child of persisted.children) {
    children.push(
      await rebuildTreeFromPersisted(child, sessionId, cols, rows, onLeafBuilt),
    )
  }
  const split: SplitNode = {
    kind: 'split',
    id: persisted.id,
    direction: persisted.direction,
    sizes: persisted.sizes.slice(),
    children,
  }
  return split
}

async function rebuildLeafFromPersisted(
  persisted: PersistedLeaf,
  sessionId: string,
  cols: number,
  rows: number,
  onLeafBuilt: (leafId: string) => void,
): Promise<LeafNode> {
  const tabs: TerminalTab[] = []
  let activeIndex = persisted.tabs.findIndex(
    (tab) => tab.id === persisted.activeTabId,
  )
  if (activeIndex < 0) activeIndex = 0

  for (const persistedTab of persisted.tabs) {
    const result = await terminalApi.create({
      sessionId,
      cwd: persistedTab.cwd,
      cols,
      rows,
    })
    tabs.push({
      id: result.id,
      cwd: persistedTab.cwd,
      title: persistedTab.title || basename(result.shell),
      pid: result.pid,
      shell: result.shell,
      status: 'running',
      exitCode: null,
    })
  }

  const leaf: LeafNode = {
    kind: 'leaf',
    id: persisted.id,
    tabs,
    activeTabId: tabs[activeIndex]?.id ?? tabs[0]?.id ?? '',
  }
  onLeafBuilt(leaf.id)
  return leaf
}
