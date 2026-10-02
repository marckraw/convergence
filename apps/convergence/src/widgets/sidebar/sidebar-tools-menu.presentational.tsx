import type { FC } from 'react'
import type { DialogKind, DialogPayload } from '@/entities/dialog'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
  IconButton,
  type TooltipSide,
} from '@convergence/ui'
import {
  BookOpenText,
  Bot,
  Cable,
  Command,
  GitBranch,
  Info,
  Library,
  MoreHorizontal,
  Settings2,
} from 'lucide-react'

const OPEN_SIDEBAR_TOOLS = 'Open sidebar tools'

interface SidebarToolsMenuProps {
  activeSurface: 'code' | 'chat'
  hasActiveProject: boolean
  /** Where the trigger's tooltip shows: below in the header, right on the rail (NAV-17). */
  tooltipSide?: TooltipSide
  onOpenDialog: (kind: DialogKind, payload?: DialogPayload) => void
  /**
   * The way into the Command Center from the shell (NAV-23): its item, with
   * the key that opens it from anywhere, already formatted ("⌘K").
   */
  commandCenter?: { shortcut: string; onOpen: () => void }
}

/** The sidebar's Tools: a ⋯ button whose menu opens every dialog the sidebar hosts. */
export const SidebarToolsMenu: FC<SidebarToolsMenuProps> = ({
  activeSurface,
  hasActiveProject,
  tooltipSide = 'bottom',
  onOpenDialog,
  commandCenter,
}) => {
  const openDialog = (kind: DialogKind, payload?: DialogPayload) => {
    onOpenDialog(kind, payload)
  }

  return (
    <Menu>
      <MenuTrigger
        render={
          <IconButton
            label={OPEN_SIDEBAR_TOOLS}
            tooltipSide={tooltipSide}
            type="button"
            variant="ghost"
          >
            <MoreHorizontal className="h-4 w-4" />
          </IconButton>
        }
      />
      <MenuContent align="start" side="bottom">
        {commandCenter ? (
          <>
            <MenuItem onClick={commandCenter.onOpen}>
              <Command className="h-3.5 w-3.5" />
              <span>Command Center…</span>
              <MenuShortcut>{commandCenter.shortcut}</MenuShortcut>
            </MenuItem>
            <MenuSeparator />
          </>
        ) : null}
        <MenuItem onClick={() => openDialog('space-workboard')}>
          <GitBranch className="h-3.5 w-3.5" />
          <span>Spaces</span>
        </MenuItem>
        <MenuItem
          disabled={activeSurface !== 'code' || !hasActiveProject}
          onClick={() => openDialog('project-settings')}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>Project Settings</span>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => openDialog('providers')}>
          <Bot className="h-3.5 w-3.5" />
          <span>Providers</span>
        </MenuItem>
        <MenuItem
          disabled={activeSurface === 'code' && !hasActiveProject}
          onClick={() => openDialog('mcp-servers')}
        >
          <Cable className="h-3.5 w-3.5" />
          <span>MCP Servers</span>
        </MenuItem>
        <MenuItem
          disabled={!hasActiveProject}
          onClick={() => openDialog('skills-browser')}
        >
          <Library className="h-3.5 w-3.5" />
          <span>Skills</span>
        </MenuItem>
        <MenuItem
          disabled={!hasActiveProject}
          onClick={() => openDialog('prompt-library')}
        >
          <BookOpenText className="h-3.5 w-3.5" />
          <span>Prompt Library</span>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onClick={() => openDialog('release-notes')}>
          <Info className="h-3.5 w-3.5" />
          <span>What&apos;s New</span>
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
