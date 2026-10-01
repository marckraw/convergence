import type { FC } from 'react'
import type { DialogKind, DialogPayload } from '@/entities/dialog'
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  IconButton,
  Tooltip,
} from '@convergence/ui'
import {
  BookOpenText,
  Bot,
  Cable,
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
  iconOnly?: boolean
  onOpenDialog: (kind: DialogKind, payload?: DialogPayload) => void
}

export const SidebarToolsMenu: FC<SidebarToolsMenuProps> = ({
  activeSurface,
  hasActiveProject,
  iconOnly = false,
  onOpenDialog,
}) => {
  const openDialog = (kind: DialogKind, payload?: DialogPayload) => {
    onOpenDialog(kind, payload)
  }

  return (
    <Menu>
      <Tooltip label={OPEN_SIDEBAR_TOOLS} side="bottom">
        <MenuTrigger
          render={
            iconOnly ? (
              <IconButton
                label={OPEN_SIDEBAR_TOOLS}
                type="button"
                variant="ghost"
              >
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            ) : (
              <Button
                type="button"
                variant="quiet"
                className="w-full justify-between px-2"
                aria-label={OPEN_SIDEBAR_TOOLS}
              >
                <span className="flex items-center gap-2">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Tools
                </span>
                <span className="text-[11px] text-muted-foreground/80">
                  Dialogs
                </span>
              </Button>
            )
          }
        />
      </Tooltip>
      <MenuContent align={iconOnly ? 'start' : 'end'} side="bottom">
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
