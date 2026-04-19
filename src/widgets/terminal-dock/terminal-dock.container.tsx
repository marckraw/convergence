import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useSessionStore } from '@/entities/session'
import {
  useTerminalStore,
  findLeaf,
  findAdjacentLeaf,
  matchShortcut,
  terminalApi,
} from '@/entities/terminal'
import type {
  FocusDirection,
  SplitDirection,
  TerminalShortcut,
} from '@/entities/terminal'
import {
  CloseConfirmDialog,
  xtermRegistry,
  type CloseConfirmRequest,
} from '@/features/terminal-pane'
import { dockStyles } from './terminal-dock.styles'
import { SplitNodeView } from './split-node.presentational'
import { DockResizeHandle } from './dock-resize.container'

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

function getPlatform(): 'mac' | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  return navigator.platform.toLowerCase().includes('mac') ? 'mac' : 'other'
}

export const TerminalDockContainer: FC = () => {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const activeSession = useSessionStore((s) =>
    s.activeSessionId
      ? (s.sessions.find((session) => session.id === s.activeSessionId) ?? null)
      : null,
  )
  const tree = useTerminalStore((s) =>
    activeSessionId ? (s.treesBySessionId[activeSessionId] ?? null) : null,
  )
  const focusedLeafId = useTerminalStore((s) =>
    activeSessionId
      ? (s.focusedLeafBySessionId[activeSessionId] ?? null)
      : null,
  )
  const dockHeight = useTerminalStore((s) =>
    activeSessionId ? (s.dockHeightBySessionId[activeSessionId] ?? 280) : 280,
  )
  const dockVisible = useTerminalStore((s) =>
    activeSessionId
      ? (s.dockVisibleBySessionId[activeSessionId] ?? true)
      : true,
  )
  const newTab = useTerminalStore((s) => s.newTab)
  const splitLeaf = useTerminalStore((s) => s.splitLeaf)
  const closeTab = useTerminalStore((s) => s.closeTab)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const setFocusedLeaf = useTerminalStore((s) => s.setFocusedLeaf)
  const resizeSplit = useTerminalStore((s) => s.resizeSplit)
  const toggleDockVisible = useTerminalStore((s) => s.toggleDockVisible)
  const setDockVisible = useTerminalStore((s) => s.setDockVisible)
  const openFirstPane = useTerminalStore((s) => s.openFirstPane)

  const [closeRequest, setCloseRequest] = useState<CloseConfirmRequest | null>(
    null,
  )

  const sessionId = activeSession?.id ?? null
  const cwd = activeSession?.workingDirectory ?? null

  const handleNewTab = useCallback(
    (leafId: string) => {
      if (!sessionId || !cwd) return
      void newTab({
        sessionId,
        leafId,
        cwd,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
      })
    },
    [sessionId, cwd, newTab],
  )

  const handleSplit = useCallback(
    (leafId: string, direction: SplitDirection) => {
      if (!sessionId || !cwd) return
      void splitLeaf({
        sessionId,
        leafId,
        direction,
        cwd,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
      })
    },
    [sessionId, cwd, splitLeaf],
  )

  const handleCloseTab = useCallback(
    (leafId: string, tabId: string) => {
      if (!sessionId) return
      void closeTab(sessionId, leafId, tabId)
    },
    [sessionId, closeTab],
  )

  const handleCloseActiveTab = useCallback(
    (leafId: string) => {
      if (!sessionId) return
      const current = useTerminalStore.getState().getTree(sessionId)
      if (!current) return
      const found = findLeaf(current, leafId)
      if (!found) return
      void closeTab(sessionId, leafId, found.leaf.activeTabId)
    },
    [sessionId, closeTab],
  )

  const handleSelectTab = useCallback(
    (leafId: string, tabId: string) => {
      if (!sessionId) return
      setActiveTab(sessionId, leafId, tabId)
    },
    [sessionId, setActiveTab],
  )

  const handleFocusLeaf = useCallback(
    (leafId: string) => {
      if (!sessionId) return
      setFocusedLeaf(sessionId, leafId)
    },
    [sessionId, setFocusedLeaf],
  )

  const handleResizeSplit = useCallback(
    (splitId: string, sizes: number[]) => {
      if (!sessionId) return
      resizeSplit(sessionId, splitId, sizes)
    },
    [sessionId, resizeSplit],
  )

  const closeTabWithGuard = useCallback(
    async (leafId: string, tabId: string) => {
      if (!sessionId) return
      let foreground: { pid: number; name: string } | null
      try {
        foreground = await terminalApi.getForegroundProcess(tabId)
      } catch {
        foreground = null
      }
      if (!foreground) {
        void closeTab(sessionId, leafId, tabId)
        return
      }
      setCloseRequest({ sessionId, leafId, tabId, process: foreground })
    },
    [sessionId, closeTab],
  )

  const dispatchShortcut = useCallback(
    (shortcut: TerminalShortcut) => {
      if (!sessionId) return

      if (shortcut.kind === 'new-tab') {
        const visible =
          useTerminalStore.getState().dockVisibleBySessionId[sessionId] ?? true
        if (!visible) setDockVisible(sessionId, true)
        const treeNow = useTerminalStore.getState().getTree(sessionId)
        if (!treeNow) {
          if (!cwd) return
          void openFirstPane({
            sessionId,
            cwd,
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
          })
          return
        }
        const focused =
          useTerminalStore.getState().focusedLeafBySessionId[sessionId] ?? null
        if (focused) handleNewTab(focused)
        return
      }

      if (shortcut.kind === 'toggle-dock') {
        toggleDockVisible(sessionId)
        return
      }

      const currentTree = useTerminalStore.getState().getTree(sessionId)
      if (!currentTree) return
      const leafId =
        useTerminalStore.getState().focusedLeafBySessionId[sessionId] ?? null
      const leafEntry = leafId ? findLeaf(currentTree, leafId) : null

      switch (shortcut.kind) {
        case 'split': {
          if (leafId) handleSplit(leafId, shortcut.direction)
          return
        }
        case 'close-tab': {
          if (leafId && leafEntry) {
            void closeTabWithGuard(leafId, leafEntry.leaf.activeTabId)
          }
          return
        }
        case 'cycle-tab': {
          if (!leafId || !leafEntry) return
          const tabs = leafEntry.leaf.tabs
          if (tabs.length < 2) return
          const activeIndex = tabs.findIndex(
            (t) => t.id === leafEntry.leaf.activeTabId,
          )
          const delta = shortcut.direction === 'next' ? 1 : -1
          const nextIndex = (activeIndex + delta + tabs.length) % tabs.length
          setActiveTab(sessionId, leafId, tabs[nextIndex]!.id)
          return
        }
        case 'focus-adjacent': {
          if (!leafId) return
          const target = findAdjacentLeaf(
            currentTree,
            leafId,
            shortcut.direction as FocusDirection,
          )
          if (target) setFocusedLeaf(sessionId, target)
          return
        }
        case 'clear': {
          if (!leafEntry) return
          xtermRegistry.clear(leafEntry.leaf.activeTabId)
          return
        }
      }
    },
    [
      sessionId,
      cwd,
      handleNewTab,
      handleSplit,
      closeTabWithGuard,
      setActiveTab,
      setFocusedLeaf,
      toggleDockVisible,
      setDockVisible,
      openFirstPane,
    ],
  )

  useEffect(() => {
    if (!sessionId) return
    const platform = getPlatform()
    const handler = (event: KeyboardEvent) => {
      const shortcut = matchShortcut(event, platform)
      if (!shortcut) return
      event.preventDefault()
      event.stopPropagation()
      dispatchShortcut(shortcut)
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
    }
  }, [sessionId, dispatchShortcut])

  if (!activeSessionId || !activeSession || !tree) return null
  if (!dockVisible) return null

  return (
    <>
      <div
        className={dockStyles.root}
        style={{ height: dockHeight }}
        data-testid="terminal-dock"
      >
        <DockResizeHandle sessionId={activeSessionId} />
        <div className={dockStyles.inner} style={{ height: dockHeight - 4 }}>
          <SplitNodeView
            tree={tree}
            sessionId={activeSessionId}
            focusedLeafId={focusedLeafId}
            onSelectTab={handleSelectTab}
            onNewTab={handleNewTab}
            onSplit={handleSplit}
            onCloseActiveTab={handleCloseActiveTab}
            onCloseTab={handleCloseTab}
            onFocusLeaf={handleFocusLeaf}
            onResizeSplit={handleResizeSplit}
          />
        </div>
      </div>
      <CloseConfirmDialog
        request={closeRequest}
        onCancel={() => setCloseRequest(null)}
        onConfirm={(req) => {
          setCloseRequest(null)
          void closeTab(req.sessionId, req.leafId, req.tabId)
        }}
      />
    </>
  )
}
