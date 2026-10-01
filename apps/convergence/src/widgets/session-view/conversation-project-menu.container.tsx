import type { FC, Ref } from 'react'
import { ChevronDown, GitPullRequest, TerminalSquare } from 'lucide-react'
import type { Project } from '@/entities/project'
import {
  ProjectOpenMenuSection,
  useProjectOpenApps,
} from '@/features/project-open-menu'
import { ProjectActionsMenu } from '@/widgets/project-actions-menu'
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@convergence/ui'
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

/** A tool's row in the Project panel: a full-width quiet button, its icon first. */
const TOOL_ROW = 'w-full justify-start gap-2 px-2 font-normal'

/**
 * The header's Project group (MAR-3429 CH4 R4): one trigger for the
 * project's tools, in sections -- the project's configured commands first
 * (each one activation away, running and showing its output in place as the
 * Project actions panel always has), then Open in…, then the conversation's
 * Pull request (its status, and the panel) and its Terminal. A panel of
 * buttons, so a Popover: every one of them is reachable by Tab (MAR-3616).
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
    <Tooltip label="Project actions, Open in, pull request and terminal">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'gap-1',
          running && 'text-emerald-600 dark:text-emerald-300',
        )}
      >
        {running && (
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
          />
        )}
        Project
        {running && <span className="sr-only">, an action is running</span>}
        <ChevronDown className="h-3 w-3" />
      </Button>
    </Tooltip>
  )
  // A tool acts, then the panel closes, as a chosen menu item did.
  const thenClose = (act: () => void) => () => {
    act()
    onOpenChange(false)
  }
  const tools = (afterActions: boolean) => (
    <div
      className={cn(
        'flex flex-col',
        afterActions && 'mt-2 border-t border-border/70 pt-1',
      )}
    >
      <ProjectOpenMenuSection
        apps={openApps.apps}
        loading={openApps.loading}
        disabledReason={openApps.disabledReason}
        onOpen={(app) => thenClose(() => openApps.openIn(app))()}
      />
      <div className="my-1 h-px bg-muted" />
      <Button
        variant="ghost"
        aria-pressed={pullRequestOpen}
        onClick={thenClose(onTogglePullRequest)}
        className={TOOL_ROW}
      >
        <GitPullRequest className="h-3.5 w-3.5" />
        Pull request
        <span className="ml-auto pl-3 text-2xs text-muted-foreground">
          {pullRequestLabel}
        </span>
      </Button>
      <Button
        variant="ghost"
        onClick={thenClose(onToggleTerminal)}
        className={TOOL_ROW}
      >
        <TerminalSquare className="h-3.5 w-3.5" />
        {hasTerminal ? 'Close terminal' : 'Open terminal'}
      </Button>
    </div>
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
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        contentFocus?.onOpenChange(next, details)
        onOpenChange(next)
      }}
    >
      <PopoverTrigger render={trigger(false)} />
      <PopoverContent
        aria-label="Project"
        align="end"
        className="w-72 p-1.5"
        finalFocus={contentFocus?.finalFocus}
      >
        {tools(false)}
      </PopoverContent>
    </Popover>
  )
}
