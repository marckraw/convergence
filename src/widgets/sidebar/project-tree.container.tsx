import { useState } from 'react'
import type { FC } from 'react'
import type { Workspace } from '@/entities/workspace'
import type { Session } from '@/entities/session'
import { SessionCreateInline } from '@/features/session-create-inline'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { cn } from '@/shared/lib/cn.pure'
import { ChevronRight, GitBranch, Plus, Trash2 } from 'lucide-react'

interface ProjectTreeProps {
  baseBranchName: string | null
  workspaces: Workspace[]
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onDeleteWorkspace: (workspaceId: string) => void
  onCreateWorkspace: (branchName: string) => void
}

export const ProjectTree: FC<ProjectTreeProps> = ({
  baseBranchName,
  workspaces,
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onDeleteWorkspace,
  onCreateWorkspace,
}) => {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    new Set(),
  )
  const [newBranch, setNewBranch] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)

  const toggleWorkspace = (id: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rootSessions = sessions.filter((s) => !s.workspaceId)
  const getWorkspaceSessions = (wsId: string) =>
    sessions.filter((s) => s.workspaceId === wsId)

  const renderSessionRow = (session: Session) => (
    <div
      key={session.id}
      className={cn(
        'group/session flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent',
        activeSessionId === session.id && 'bg-accent',
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSelectSession(session.id)}
            className="h-auto min-w-0 flex-1 justify-start gap-1.5 px-1.5 py-1 text-left text-xs font-normal"
          >
            <SessionBadge attention={session.attention} />
            <span className="truncate">{session.name}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{session.name}</TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/session:opacity-100 focus-visible:opacity-100"
        onClick={(event) => {
          event.stopPropagation()
          onDeleteSession(session.id)
        }}
        aria-label={`Delete session ${session.name}`}
        title="Delete session"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )

  return (
    <div className="px-3">
      {/* Root sessions (on main branch) */}
      <div className="mb-1 ml-2 border-l border-border pl-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="mb-0.5 truncate text-xs text-muted-foreground">
              {(baseBranchName || 'main') +
                (rootSessions.length > 0 ? ` (${rootSessions.length})` : '')}
            </p>
          </TooltipTrigger>
          <TooltipContent side="right">
            {baseBranchName || 'main'}
          </TooltipContent>
        </Tooltip>
        {rootSessions.map(renderSessionRow)}
        <div className="mt-1">
          <SessionCreateInline workspaceId={null} />
        </div>
      </div>

      {/* Workspaces */}
      {workspaces.map((ws) => {
        const wsSessions = getWorkspaceSessions(ws.id)
        const isExpanded = expandedWorkspaces.has(ws.id)

        return (
          <div key={ws.id} className="ml-2 border-l border-border pl-2">
            <div className="group/workspace flex min-w-0 items-center gap-1 rounded pr-1 transition-colors hover:bg-accent">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => toggleWorkspace(ws.id)}
                    className="h-auto min-w-0 flex-1 justify-start gap-1 py-1 text-left text-sm font-normal hover:text-foreground"
                  >
                    <ChevronRight
                      className={cn(
                        'h-3 w-3 shrink-0 transition-transform',
                        isExpanded && 'rotate-90',
                      )}
                    />
                    <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{ws.branchName}</span>
                    {wsSessions.length > 0 && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {wsSessions.length}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{ws.branchName}</TooltipContent>
              </Tooltip>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/workspace:opacity-100 focus-visible:opacity-100"
                onClick={(event) => {
                  event.stopPropagation()
                  onDeleteWorkspace(ws.id)
                }}
                aria-label={`Delete workspace ${ws.branchName}`}
                title="Delete workspace"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {isExpanded && (
              <div className="ml-4 space-y-0.5">
                {wsSessions.map(renderSessionRow)}
                <div className="mt-1">
                  <SessionCreateInline workspaceId={ws.id} />
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* New workspace */}
      <div className="mt-2 ml-2">
        {showNewBranch ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (newBranch.trim()) {
                onCreateWorkspace(newBranch.trim())
                setNewBranch('')
                setShowNewBranch(false)
              }
            }}
            className="flex gap-1"
          >
            <Input
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="branch..."
              className="h-7 text-xs"
              autoFocus
              onBlur={() => {
                if (!newBranch.trim()) setShowNewBranch(false)
              }}
            />
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowNewBranch(true)}
            className="h-auto items-center gap-1 px-0 py-0 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            New workspace
          </Button>
        )}
      </div>
    </div>
  )
}
