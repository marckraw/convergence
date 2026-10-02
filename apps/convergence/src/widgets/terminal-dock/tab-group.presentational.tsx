import type { FC, ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { TerminalTab } from '@/entities/terminal'
import {
  IconButton,
  Tabs,
  TabsList,
  TabsTab,
  ThemeScope,
  Tooltip,
} from '@convergence/ui'

interface TabGroupProps {
  tabs: TerminalTab[]
  activeTabId: string
  onSelect: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewTab: () => void
  /** New tab's key in words ("⌘T"), for its tooltip (NAV-23). */
  newTabShortcut?: string
  /** Close tab's key in words ("⌘W"), on the open tab's ✕: the tab it closes (NAV-23). */
  closeTabShortcut?: string
  trailingSlot?: ReactNode
}

/**
 * The terminal's tab strip: the kit's `strip` Tabs in a dark ThemeScope, so
 * it stays dark beside the terminal in both themes (R12). Moving along the
 * tabs with the arrows switches terminals, as it did; Delete on a tab closes
 * it. A tab's tooltip names its folder.
 */
export const TabGroup: FC<TabGroupProps> = ({
  tabs,
  activeTabId,
  onSelect,
  onCloseTab,
  onNewTab,
  newTabShortcut,
  closeTabShortcut,
  trailingSlot,
}) => {
  return (
    <ThemeScope
      theme="dark"
      className="flex items-center gap-1 border-b border-line-soft bg-terminal-strip pl-1 pr-2"
    >
      <Tabs
        // The strip on the terminal's own tab tokens (R12).
        variant="terminal"
        value={activeTabId}
        onValueChange={(value) => onSelect(String(value))}
        className="min-w-0 flex-1 flex-row items-center gap-0.5"
      >
        <TabsList
          aria-label="Terminal tabs"
          activateOnFocus
          className="min-w-0"
        >
          {tabs.map((tab) => {
            const label =
              tab.status === 'exited' ? `${tab.title} (exited)` : tab.title
            return (
              <Tooltip key={tab.id} label={label} detail={tab.cwd}>
                <TabsTab
                  value={tab.id}
                  // An exited tab says so in words and leans; fading it lost
                  // its contrast (2.9:1).
                  className={tab.status === 'exited' ? 'italic' : undefined}
                  onClose={() => onCloseTab(tab.id)}
                  closeLabel={`Close tab ${tab.title}`}
                  closeShortcut={
                    tab.id === activeTabId ? closeTabShortcut : undefined
                  }
                >
                  {label}
                </TabsTab>
              </Tooltip>
            )
          })}
        </TabsList>
        <IconButton
          label="New tab"
          shortcut={newTabShortcut}
          type="button"
          variant="ghost"
          onClick={onNewTab}
          size="xs"
        >
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
      </Tabs>
      {trailingSlot ? (
        <div className="flex shrink-0 items-center gap-0.5">{trailingSlot}</div>
      ) : null}
    </ThemeScope>
  )
}
