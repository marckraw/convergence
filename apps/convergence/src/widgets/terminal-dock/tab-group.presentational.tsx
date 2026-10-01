import type { FC } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Plus, X } from 'lucide-react'
import type { TerminalTab } from '@/entities/terminal'
import { cn, IconButton } from '@convergence/ui'

interface TabGroupProps {
  tabs: TerminalTab[]
  activeTabId: string
  onSelect: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewTab: () => void
  trailingSlot?: React.ReactNode
}

export const TabGroup: FC<TabGroupProps> = ({
  tabs,
  activeTabId,
  onSelect,
  onCloseTab,
  onNewTab,
  trailingSlot,
}) => {
  return (
    <Tabs.Root
      value={activeTabId}
      onValueChange={onSelect}
      className="flex items-center gap-1 border-b border-border/60 bg-background/40 pl-1 pr-2"
    >
      <Tabs.List
        className="flex min-w-0 flex-1 items-center gap-0.5"
        aria-label="Terminal tabs"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const label =
            tab.status === 'exited' ? `${tab.title} (exited)` : tab.title
          return (
            <div
              key={tab.id}
              className={cn(
                'group relative flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
                isActive
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-background/60',
              )}
            >
              <Tabs.Trigger
                value={tab.id}
                className={cn(
                  'flex items-center gap-1 focus:outline-none',
                  tab.status === 'exited' && 'opacity-60',
                )}
                title={tab.cwd}
              >
                <span className="truncate">{label}</span>
              </Tabs.Trigger>
              <IconButton
                label={`Close tab ${tab.title}`}
                type="button"
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseTab(tab.id)
                }}
                size="xs"
                className={cn(
                  'opacity-0 group-hover:opacity-100',
                  isActive && 'opacity-70',
                )}
              >
                <X className="h-3 w-3" />
              </IconButton>
            </div>
          )
        })}
        <IconButton
          label="New tab"
          type="button"
          variant="ghost"
          onClick={onNewTab}
          size="xs"
        >
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
      </Tabs.List>
      {trailingSlot ? (
        <div className="flex shrink-0 items-center">{trailingSlot}</div>
      ) : null}
    </Tabs.Root>
  )
}
