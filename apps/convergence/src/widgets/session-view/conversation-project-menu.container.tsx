import type { FC, Ref } from 'react'
import { ChevronDown, GitPullRequest, TerminalSquare } from 'lucide-react'
import type { Project } from '@/entities/project'
import {
  ProjectOpenMenuSection,
  useProjectOpenApps,
} from '@/features/project-open-menu'
import { ProjectActionsMenu } from '@/widgets/project-actions-menu'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import type { HeaderMenuFocus } from './conversation-header.container'

interface ConversationProjectMenuProps {
  /** The conversation's own project; null when the store no longer has it. */
  project: Project | null
  /** Where the project's commands run: the conversation's working directory. */
  runtimeCwd: string | null
  /** What Open in… opens: the conversation's workspace. */
  openPath: string | null
  pullRequestLabel: string
  pullRequestOpen: boolean
  onTogglePullRequest: () => void
  hasTerminal: boolean
  onToggleTerminal: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerRef?: Ref<HTMLButtonElement>
  /** From the header, which may have moved this menu into More. */
  contentFocus?: HeaderMenuFocus
}

/**
 * The header's Project group (MAR-3429 CH4 R4): one trigger for the
 * project's tools, in sections -- the project's configured commands first
 * (each one activation away, running and showing its output in place as the
 * Project actions menu always has), then Open in…, then the conversation's
 * Pull request (its status, and the panel) and its Terminal.
 */
export const ConversationProjectMenu: FC<ConversationProjectMenuProps> = ({
  project,
  runtimeCwd,
  openPath,
  pullRequestLabel,
  pullRequestOpen,
  onTogglePullRequest,
  hasTerminal,
  onToggleTerminal,
  open,
  onOpenChange,
  triggerRef,
  contentFocus,
}) => {
  // Read once while the header lives, not on each open (lap 2 D).
  const openApps = useProjectOpenApps(openPath)
  const trigger = (running: boolean) => (
    <Button
      ref={triggerRef}
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-7 gap-1 px-2 text-xs',
        running && 'text-emerald-600 dark:text-emerald-300',
      )}
      title="Project actions, Open in, pull request and terminal"
    >
      {running && (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      )}
      Project
      {running && <span className="sr-only">, an action is running</span>}
      <ChevronDown className="h-3 w-3" />
    </Button>
  )
  const tools = (afterActions: boolean) => (
    <>
      {afterActions && <DropdownMenuSeparator />}
      <ProjectOpenMenuSection
        apps={openApps.apps}
        loading={openApps.loading}
        disabledReason={openApps.disabledReason}
        onOpen={openApps.openIn}
      />
      <DropdownMenuSeparator />
      <DropdownMenuItem
        role="menuitemcheckbox"
        aria-checked={pullRequestOpen}
        onSelect={onTogglePullRequest}
        className="gap-2"
      >
        <GitPullRequest className="h-3.5 w-3.5" />
        Pull request
        <span className="ml-auto pl-3 text-[11px] text-muted-foreground">
          {pullRequestLabel}
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onToggleTerminal} className="gap-2">
        <TerminalSquare className="h-3.5 w-3.5" />
        {hasTerminal ? 'Close terminal' : 'Open terminal'}
      </DropdownMenuItem>
    </>
  )

  if (project)
    return (
      <ProjectActionsMenu
        project={project}
        runtimeCwd={runtimeCwd}
        contentFocus={contentFocus}
        open={open}
        onOpenChange={onOpenChange}
        renderTrigger={({ running }) => trigger(running)}
      >
        {tools(true)}
      </ProjectActionsMenu>
    )
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger(false)}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1.5" {...contentFocus}>
        {tools(false)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
