import type { FC } from 'react'
import { useCallback } from 'react'
import { useSessionStore } from '@/entities/session'
import { useTerminalStore, findLeaf } from '@/entities/terminal'
import type { SplitDirection } from '@/entities/terminal'
import { dockStyles, DOCK_HEIGHT_PX } from './terminal-dock.styles'
import { SplitNodeView } from './split-node.presentational'

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

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
  const newTab = useTerminalStore((s) => s.newTab)
  const splitLeaf = useTerminalStore((s) => s.splitLeaf)
  const closeTab = useTerminalStore((s) => s.closeTab)
  const setActiveTab = useTerminalStore((s) => s.setActiveTab)
  const setFocusedLeaf = useTerminalStore((s) => s.setFocusedLeaf)
  const resizeSplit = useTerminalStore((s) => s.resizeSplit)

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

  if (!activeSessionId || !activeSession || !tree) return null

  return (
    <div
      className={dockStyles.root}
      style={{ height: DOCK_HEIGHT_PX }}
      data-testid="terminal-dock"
    >
      <div className={dockStyles.inner}>
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
  )
}
