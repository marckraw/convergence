import type { FC } from 'react'
import { GitBranch } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import type { SearchableSelectItem } from '@/shared/ui/searchable-select.presentational'

export const PROJECT_DEFAULT_ID = '__project_default__'

interface WorkspaceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  branchName: string
  onBranchNameChange: (value: string) => void
  baseBranchItems: SearchableSelectItem[]
  selectedBaseBranchId: string
  selectedBaseBranchLabel: string
  onBaseBranchChange: (id: string) => void
  isLoadingBranches: boolean
  isSubmitting: boolean
  error: string | null
  onSubmit: () => void
}

export const WorkspaceCreateDialog: FC<WorkspaceCreateDialogProps> = ({
  open,
  onOpenChange,
  projectName,
  branchName,
  onBranchNameChange,
  baseBranchItems,
  selectedBaseBranchId,
  selectedBaseBranchLabel,
  onBaseBranchChange,
  isLoadingBranches,
  isSubmitting,
  error,
  onSubmit,
}) => {
  const canSubmit = branchName.trim().length > 0 && !isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            Create a new git worktree for {projectName}.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) onSubmit()
          }}
        >
          <div className="space-y-5 overflow-y-auto px-6 py-5">
            <section className="space-y-2">
              <label
                htmlFor="workspace-branch-name"
                className="text-sm font-medium"
              >
                Branch name
              </label>
              <Input
                id="workspace-branch-name"
                value={branchName}
                onChange={(event) => onBranchNameChange(event.target.value)}
                placeholder="feature/my-change"
                autoFocus
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                If the branch already exists it will be checked out as-is.
                Otherwise it will be created from the base branch below.
              </p>
            </section>

            <section className="space-y-2">
              <label className="text-sm font-medium">Create from</label>
              <SearchableSelect
                selectedId={selectedBaseBranchId}
                value={selectedBaseBranchLabel}
                items={baseBranchItems}
                onChange={onBaseBranchChange}
                disabled={isSubmitting}
                searchPlaceholder={
                  isLoadingBranches ? 'Loading branches...' : 'Search branches'
                }
                emptyMessage={
                  isLoadingBranches
                    ? 'Loading branches...'
                    : 'No branches found.'
                }
                triggerClassName="w-full"
                icon={<GitBranch className="h-3.5 w-3.5 shrink-0" />}
              />
              <p className="text-xs text-muted-foreground">
                Only used when creating a new branch. Pick “Use project default”
                to fall back to the project setting.
              </p>
            </section>

            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="border-t border-white/10 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
