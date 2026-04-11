import { useState } from 'react'
import type { FC } from 'react'
import type { Project } from '@/entities/project'
import type { Workspace } from '@/entities/workspace'
import type { Session } from '@/entities/session'
import { SessionCreateInline } from '@/features/session-create-inline'
import { Input } from '@/shared/ui/input'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { cn } from '@/shared/lib/cn.pure'
import { ChevronRight, GitBranch, Plus } from 'lucide-react'

interface ProjectTreeProps {
  project: Project
  workspaces: Workspace[]
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onCreateWorkspace: (branchName: string) => void
}

export const ProjectTree: FC<ProjectTreeProps> = ({
  project,
  workspaces,
  sessions,
  activeSessionId,
  onSelectSession,
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

  return (
    <div className="px-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Project
      </p>

      <p className="mb-1 truncate text-sm font-medium">{project.name}</p>

      {/* Root sessions (on main branch) */}
      <div className="mb-1 ml-2 border-l border-border pl-2">
        <p className="mb-0.5 text-xs text-muted-foreground">
          main{rootSessions.length > 0 ? ` (${rootSessions.length})` : ''}
        </p>
        {rootSessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={cn(
              'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm transition-colors hover:bg-accent',
              activeSessionId === session.id && 'bg-accent',
            )}
          >
            <SessionBadge attention={session.attention} />
            <span className="truncate">{session.name}</span>
          </button>
        ))}
        <div className="mt-1">
          <SessionCreateInline projectId={project.id} workspaceId={null} />
        </div>
      </div>

      {/* Workspaces */}
      {workspaces.map((ws) => {
        const wsSessions = getWorkspaceSessions(ws.id)
        const isExpanded = expandedWorkspaces.has(ws.id)

        return (
          <div key={ws.id} className="ml-2 border-l border-border pl-2">
            <button
              onClick={() => toggleWorkspace(ws.id)}
              className="flex w-full items-center gap-1 py-1 text-left text-sm hover:text-foreground"
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
                <span className="ml-auto text-xs text-muted-foreground">
                  {wsSessions.length}
                </span>
              )}
            </button>

            {isExpanded && (
              <div className="ml-4 space-y-0.5">
                {wsSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm transition-colors hover:bg-accent',
                      activeSessionId === session.id && 'bg-accent',
                    )}
                  >
                    <SessionBadge attention={session.attention} />
                    <span className="truncate">{session.name}</span>
                  </button>
                ))}
                <div className="mt-1">
                  <SessionCreateInline
                    projectId={project.id}
                    workspaceId={ws.id}
                  />
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
          <button
            onClick={() => setShowNewBranch(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            New workspace
          </button>
        )}
      </div>
    </div>
  )
}
