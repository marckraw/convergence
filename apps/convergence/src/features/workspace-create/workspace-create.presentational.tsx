import type { FC } from 'react'
import { GitBranch } from 'lucide-react'
import {
  Combobox,
  type ComboboxItem,
  Field,
  FieldDescription,
  FieldLabel,
  FormDialog,
  Input,
} from '@convergence/ui'

export const PROJECT_DEFAULT_ID = '__project_default__'

interface WorkspaceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  branchName: string
  onBranchNameChange: (value: string) => void
  baseBranchItems: ComboboxItem[]
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
}) => (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title="New workspace"
    description={`Create a new git worktree for ${projectName}.`}
    saves="on-save"
    onSave={onSubmit}
    saveLabel="Create workspace"
    pendingLabel="Creating…"
    pending={isSubmitting}
    saveDisabledReason={
      branchName.trim().length === 0 ? 'Name the branch first.' : undefined
    }
    error={error}
  >
    <div className="space-y-5">
      <Field disabled={isSubmitting}>
        <FieldLabel>Branch name</FieldLabel>
        <Input
          size="lg"
          value={branchName}
          onChange={(event) => onBranchNameChange(event.target.value)}
          placeholder="feature/my-change"
          autoFocus
        />
        <FieldDescription>
          If the branch already exists it will be checked out as-is. Otherwise
          it will be created from the base branch below.
        </FieldDescription>
      </Field>

      {/*
        Not a Field: a Field's context reaches the Combobox's popup, and its
        search field would take the label too. The trigger is named instead.
      */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Create from</span>
        <Combobox
          selectedId={selectedBaseBranchId}
          value={selectedBaseBranchLabel}
          items={baseBranchItems}
          onChange={onBaseBranchChange}
          disabled={isSubmitting}
          ariaLabel="Create from"
          searchPlaceholder={
            isLoadingBranches ? 'Loading branches…' : 'Search branches'
          }
          emptyMessage={
            isLoadingBranches ? 'Loading branches…' : 'No branches found.'
          }
          className="w-full"
          icon={<GitBranch className="size-3.5 shrink-0" />}
        />
        <p className="text-xs text-ink-muted">
          Only used when creating a new branch. Pick “Use project default” to
          fall back to the project setting.
        </p>
      </div>
    </div>
  </FormDialog>
)
