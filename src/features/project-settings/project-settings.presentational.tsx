import type { FC, ReactNode } from 'react'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/cn.pure'
import type { WorkspaceStartStrategy } from '@/entities/project'

interface ProjectSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  strategy: WorkspaceStartStrategy
  baseBranchName: string
  isSaving: boolean
  error: string | null
  onStrategyChange: (strategy: WorkspaceStartStrategy) => void
  onBaseBranchNameChange: (value: string) => void
  onSave: () => void
  trigger: ReactNode
  contextSection?: ReactNode
}

export const ProjectSettingsDialog: FC<ProjectSettingsDialogProps> = ({
  open,
  onOpenChange,
  projectName,
  strategy,
  baseBranchName,
  isSaving,
  error,
  onStrategyChange,
  onBaseBranchNameChange,
  onSave,
  trigger,
  contextSection,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>
            Configure how new workspaces branch for {projectName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Workspace Start Point</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                This only affects new branches. Existing branches are checked
                out as-is.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={strategy === 'base-branch' ? 'secondary' : 'outline'}
                className={cn(
                  'h-auto w-full min-w-0 items-start justify-start whitespace-normal px-3 py-3 text-left',
                  strategy === 'base-branch' && 'ring-1 ring-ring',
                )}
                onClick={() => onStrategyChange('base-branch')}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">Base branch</span>
                  <span className="whitespace-normal break-words text-xs text-muted-foreground">
                    Start from the project base branch.
                  </span>
                </span>
              </Button>

              <Button
                type="button"
                variant={strategy === 'current-head' ? 'secondary' : 'outline'}
                className={cn(
                  'h-auto w-full min-w-0 items-start justify-start whitespace-normal px-3 py-3 text-left',
                  strategy === 'current-head' && 'ring-1 ring-ring',
                )}
                onClick={() => onStrategyChange('current-head')}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">Current HEAD</span>
                  <span className="whitespace-normal break-words text-xs text-muted-foreground">
                    Start from whatever commit the source repo currently has
                    checked out.
                  </span>
                </span>
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <label
              htmlFor="project-base-branch"
              className="text-sm font-medium"
            >
              Base branch name
            </label>
            <Input
              id="project-base-branch"
              value={baseBranchName}
              onChange={(event) => onBaseBranchNameChange(event.target.value)}
              placeholder="Auto-detect (for example: master or main)"
              disabled={strategy !== 'base-branch' || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-detect from the repository. When an{' '}
              <code>origin/&lt;branch&gt;</code> remote-tracking ref exists,
              Convergence will use that before falling back to the local branch.
            </p>
          </section>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {contextSection ? (
            <section className="space-y-3 border-t border-white/10 pt-5">
              {contextSection}
            </section>
          ) : null}
        </div>

        <DialogFooter className="border-t border-white/10 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
