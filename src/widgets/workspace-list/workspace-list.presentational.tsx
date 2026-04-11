import type { FC, ReactNode } from 'react'
import type { Workspace } from '@/entities/workspace'
import { Button } from '@/shared/ui/button'
import { GitBranch, Trash2, FolderOpen } from 'lucide-react'

interface WorkspaceListShellProps {
  workspaces: Workspace[]
  currentBranch: string | null
  onDelete: (id: string) => void
  createForm: ReactNode
}

export const WorkspaceListShell: FC<WorkspaceListShellProps> = ({
  workspaces,
  currentBranch,
  onDelete,
  createForm,
}) => (
  <div className="w-full max-w-lg">
    <div className="mb-3 flex items-center gap-2">
      <GitBranch className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">Workspaces</h2>
      {currentBranch && (
        <span className="text-xs text-muted-foreground">
          (repo on {currentBranch})
        </span>
      )}
    </div>

    {workspaces.length > 0 && (
      <div className="mb-4 space-y-2">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{ws.branchName}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {ws.path}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(ws.id)}
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    )}

    {createForm}
  </div>
)
