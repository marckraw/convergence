import type { FC } from 'react'
import type { DialogKind, DialogPayload } from '@/entities/dialog'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import {
  BookOpenText,
  Bot,
  Cable,
  FileCode2,
  GitBranch,
  Info,
  Library,
  MoreHorizontal,
  Settings2,
} from 'lucide-react'

interface SidebarToolsMenuProps {
  activeSurface: 'code' | 'chat'
  hasActiveProject: boolean
  iconOnly?: boolean
  onOpenCodeReview?: () => void
  onOpenDialog: (kind: DialogKind, payload?: DialogPayload) => void
}

export const SidebarToolsMenu: FC<SidebarToolsMenuProps> = ({
  activeSurface,
  hasActiveProject,
  iconOnly = false,
  onOpenCodeReview,
  onOpenDialog,
}) => {
  const openDialog = (kind: DialogKind, payload?: DialogPayload) => {
    onOpenDialog(kind, payload)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={iconOnly ? 'icon' : 'sm'}
          className={
            iconOnly
              ? 'h-8 w-8'
              : 'h-8 w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground'
          }
          aria-label="Open sidebar tools"
          title="Tools"
        >
          {iconOnly ? (
            <MoreHorizontal className="h-4 w-4" />
          ) : (
            <>
              <span className="flex items-center gap-2">
                <MoreHorizontal className="h-3.5 w-3.5" />
                Tools
              </span>
              <span className="text-[11px] text-muted-foreground/80">
                Dialogs
              </span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={iconOnly ? 'start' : 'end'} side="bottom">
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => openDialog('space-workboard')}
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span>Spaces</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          disabled={activeSurface !== 'code' || !hasActiveProject}
          onSelect={() => openDialog('project-settings')}
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>Project Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          disabled={!hasActiveProject}
          onSelect={() => onOpenCodeReview?.()}
        >
          <FileCode2 className="h-3.5 w-3.5" />
          <span>Code Review</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => openDialog('providers')}
        >
          <Bot className="h-3.5 w-3.5" />
          <span>Providers</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          disabled={activeSurface === 'code' && !hasActiveProject}
          onSelect={() => openDialog('mcp-servers')}
        >
          <Cable className="h-3.5 w-3.5" />
          <span>MCP Servers</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          disabled={!hasActiveProject}
          onSelect={() => openDialog('skills-browser')}
        >
          <Library className="h-3.5 w-3.5" />
          <span>Skills</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          disabled={!hasActiveProject}
          onSelect={() => openDialog('prompt-library')}
        >
          <BookOpenText className="h-3.5 w-3.5" />
          <span>Prompt Library</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => openDialog('release-notes')}
        >
          <Info className="h-3.5 w-3.5" />
          <span>What&apos;s New</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
