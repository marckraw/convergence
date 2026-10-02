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
  /** The key that also creates it, in words ("⌘↵"), for Create's tooltip. */
  submitShortcut?: string
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
  submitShortcut,
}) => (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title="New workspace"
    description={`Create a new git worktree for ${projectName}.`}
    saves="on-save"
    onSave={onSubmit}
    saveShortcut={submitShortcut}
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

      {/* In its Field the Combobox is named by the label and described by
          the hint; its search keeps its own name (DLG-7). It wears the field
          frame, as the Input above does (DLG-15). */}
      <Field disabled={isSubmitting}>
        <FieldLabel nativeLabel={false} render={<div />}>
          Create from
        </FieldLabel>
        <Combobox
          variant="field"
          selectedId={selectedBaseBranchId}
          value={selectedBaseBranchLabel}
          items={baseBranchItems}
          onChange={onBaseBranchChange}
          disabled={isSubmitting}
          searchPlaceholder={
            isLoadingBranches ? 'Loading branches…' : 'Search branches'
          }
          emptyMessage={
            isLoadingBranches ? 'Loading branches…' : 'No branches found.'
          }
          className="w-full"
          icon={<GitBranch className="size-3.5 shrink-0" />}
        />
        <FieldDescription>
          Only used when creating a new branch. Pick “Use project default” to
          fall back to the project setting.
        </FieldDescription>
      </Field>
    </div>
  </FormDialog>
)
