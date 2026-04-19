import type { FC } from 'react'
import type { LeafNode, SplitDirection } from '@/entities/terminal'
import { TerminalPaneContainer, PaneToolbar } from '@/features/terminal-pane'
import { cn } from '@/shared/lib/cn.pure'
import { TabGroup } from './tab-group.presentational'

export interface LeafPaneHandlers {
  sessionId: string
  focusedLeafId: string | null
  onSelectTab: (leafId: string, tabId: string) => void
  onNewTab: (leafId: string) => void
  onSplit: (leafId: string, direction: SplitDirection) => void
  onCloseActiveTab: (leafId: string) => void
  onCloseTab: (leafId: string, tabId: string) => void
  onFocusLeaf: (leafId: string) => void
}

interface LeafPaneViewProps extends LeafPaneHandlers {
  leaf: LeafNode
}

export const LeafPaneView: FC<LeafPaneViewProps> = ({
  leaf,
  sessionId,
  focusedLeafId,
  onSelectTab,
  onNewTab,
  onSplit,
  onCloseActiveTab,
  onCloseTab,
  onFocusLeaf,
}) => {
  const activeTab = leaf.tabs.find((t) => t.id === leaf.activeTabId)
  const isFocused = focusedLeafId === leaf.id
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        isFocused && 'ring-1 ring-primary/30',
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
            onClose={() => onCloseActiveTab(leaf.id)}
          />
        }
      />
      {activeTab ? (
        <TerminalPaneContainer
          key={activeTab.id}
          sessionId={sessionId}
          tabId={activeTab.id}
          isFocused={isFocused}
        />
      ) : (
        <div className="flex-1" />
      )}
    </div>
  )
}
