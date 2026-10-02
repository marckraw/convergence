import { Fragment, type FC, type ReactNode } from 'react'
import type { LeafNode, SplitDirection } from '@/entities/terminal'
import { PaneToolbar } from '@/features/terminal-pane'
import { cn } from '@convergence/ui'
import { TabGroup } from './tab-group.presentational'

/** The open tab's terminal, which the dock's container draws (xterm and its IPC live there). */
export interface TerminalPaneSlot {
  tabId: string
  isFocused: boolean
}

export interface LeafPaneHandlers {
  focusedLeafId: string | null
  onSelectTab: (leafId: string, tabId: string) => void
  onNewTab: (leafId: string) => void
  onSplit: (leafId: string, direction: SplitDirection) => void
  onCloseTab: (leafId: string, tabId: string) => void
  onFocusLeaf: (leafId: string) => void
  /** Draws the open tab's terminal; a story passes a still picture of one. */
  renderTerminal: (pane: TerminalPaneSlot) => ReactNode
}

interface LeafPaneViewProps extends LeafPaneHandlers {
  leaf: LeafNode
}

/**
 * One pane of the terminal dock: its tab strip, the split buttons, and the
 * open tab's terminal under them. Each tab carries its own ✕, so the toolbar
 * draws no second close for the open one (NAV-9).
 */
export const LeafPaneView: FC<LeafPaneViewProps> = ({
  leaf,
  focusedLeafId,
  onSelectTab,
  onNewTab,
  onSplit,
  onCloseTab,
  onFocusLeaf,
  renderTerminal,
}) => {
  const activeTab = leaf.tabs.find((t) => t.id === leaf.activeTabId)
  const isFocused = focusedLeafId === leaf.id
  return (
    <div
      className={cn(
        'flex h-full w-full min-w-0 min-h-0 flex-col',
        isFocused && 'ring-1 ring-strong/30',
      )}
      onPointerDownCapture={() => onFocusLeaf(leaf.id)}
      data-leaf-id={leaf.id}
    >
      <TabGroup
        tabs={leaf.tabs}
        activeTabId={leaf.activeTabId}
        onSelect={(tabId) => onSelectTab(leaf.id, tabId)}
        onCloseTab={(tabId) => onCloseTab(leaf.id, tabId)}
        onNewTab={() => onNewTab(leaf.id)}
        trailingSlot={
          <PaneToolbar
            onSplitHorizontal={() => onSplit(leaf.id, 'horizontal')}
            onSplitVertical={() => onSplit(leaf.id, 'vertical')}
          />
        }
      />
      {activeTab ? (
        <Fragment key={activeTab.id}>
          {renderTerminal({ tabId: activeTab.id, isFocused })}
        </Fragment>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  )
}
