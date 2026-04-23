import type { FC } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export interface WorkspaceOption {
  id: string | null
  label: string
}

export interface TerminalSessionCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  onNameChange: (value: string) => void
  workspaces: WorkspaceOption[]
  selectedWorkspaceId: string | null
  onSelectWorkspace: (id: string | null) => void
  nameError: string | null
  submitError: string | null
  submitting: boolean
  onCancel: () => void
  onSubmit: () => void
}

export const TerminalSessionCreateDialog: FC<TerminalSessionCreateDialogProps> = ({
  open,
  onOpenChange,
  name,
  onNameChange,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  nameError,
  submitError,
  submitting,
  onCancel,
  onSubmit,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>New terminal session</DialogTitle>
        <DialogDescription>
          Opens a shell in the selected workspace. No AI provider is attached.
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!submitting) onSubmit()
        }}
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="terminal-session-name"
            className="text-xs font-medium text-foreground"
          >
            Name
          </label>
          <Input
            id="terminal-session-name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Terminal"
            autoFocus
            data-testid="terminal-session-name-input"
          />
          {nameError ? (
            <span
              className="text-xs text-destructive"
              data-testid="terminal-session-name-error"
            >
              {nameError}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-foreground">
            Workspace
          </span>
          <div
            className="flex flex-wrap gap-1"
            role="radiogroup"
            aria-label="Workspace"
            data-testid="terminal-session-workspace-options"
          >
            {workspaces.map((workspace) => {
              const selected = workspace.id === selectedWorkspaceId
              return (
                <Button
                  key={workspace.id ?? 'none'}
                  type="button"
                  variant={selected ? 'secondary' : 'outline'}
                  size="sm"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelectWorkspace(workspace.id)}
                >
                  {workspace.label}
                </Button>
              )
            })}
          </div>
        </div>

        {submitError ? (
          <p
            className="text-xs text-destructive"
            data-testid="terminal-session-submit-error"
          >
            {submitError}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            data-testid="terminal-session-submit"
          >
            {submitting ? 'Creating…' : 'Create terminal'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
)
