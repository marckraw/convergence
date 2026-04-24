import type { FC } from 'react'
import { GitBranch, Link2, Plus, Unlink } from 'lucide-react'
import type {
  Initiative,
  InitiativeAttempt,
  InitiativeAttemptRole,
} from '@/entities/initiative'
import {
  initiativeAttemptRoleLabels,
  initiativeAttemptRoleOptions,
} from '@/entities/initiative'
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

export interface LinkedInitiativeView {
  attempt: InitiativeAttempt
  initiative: Initiative | null
}

interface InitiativeSessionLinkDialogProps {
  open: boolean
  sessionName: string
  initiatives: Initiative[]
  linkedInitiatives: LinkedInitiativeView[]
  createTitle: string
  selectedInitiativeId: string
  selectedRole: InitiativeAttemptRole
  isLoading: boolean
  isCreating: boolean
  isLinking: boolean
  isDetaching: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onCreateTitleChange: (value: string) => void
  onSelectedInitiativeChange: (id: string) => void
  onSelectedRoleChange: (role: InitiativeAttemptRole) => void
  onCreateFromSession: () => void
  onAttachToInitiative: () => void
  onDetachAttempt: (attemptId: string, initiativeId: string) => void
}

export const InitiativeSessionLinkDialog: FC<
  InitiativeSessionLinkDialogProps
> = ({
  open,
  sessionName,
  initiatives,
  linkedInitiatives,
  createTitle,
  selectedInitiativeId,
  selectedRole,
  isLoading,
  isCreating,
  isLinking,
  isDetaching,
  error,
  onOpenChange,
  onCreateTitleChange,
  onSelectedInitiativeChange,
  onSelectedRoleChange,
  onCreateFromSession,
  onAttachToInitiative,
  onDetachAttempt,
}) => {
  const linkedInitiativeIds = new Set(
    linkedInitiatives.map((entry) => entry.attempt.initiativeId),
  )
  const linkableInitiatives = initiatives.filter(
    (initiative) => !linkedInitiativeIds.has(initiative.id),
  )
  const createDisabled = createTitle.trim().length === 0 || isCreating
  const attachDisabled =
    selectedInitiativeId.length === 0 ||
    isLinking ||
    linkableInitiatives.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>Session Initiative</DialogTitle>
          <DialogDescription>
            Link this session as an Attempt in a global Initiative.
          </DialogDescription>
        </DialogHeader>

        <div className="app-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="rounded-lg border border-border/70 bg-card/30 px-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {sessionName}
                </div>
                <div className="text-xs text-muted-foreground">
                  Current session
                </div>
              </div>
            </div>
          </div>

          <section className="space-y-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Create from session
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (!createDisabled) onCreateFromSession()
              }}
            >
              <Input
                value={createTitle}
                onChange={(event) => onCreateTitleChange(event.target.value)}
                placeholder="Initiative title"
                aria-label="Initiative title from session"
                disabled={isCreating}
              />
              <Button type="submit" disabled={createDisabled} size="sm">
                <Plus className="h-4 w-4" />
                Create
              </Button>
            </form>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Attach to existing
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
              <select
                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedInitiativeId}
                onChange={(event) =>
                  onSelectedInitiativeChange(event.target.value)
                }
                disabled={linkableInitiatives.length === 0 || isLinking}
                aria-label="Existing Initiative"
              >
                <option value="">
                  {linkableInitiatives.length === 0
                    ? 'No linkable Initiatives'
                    : 'Select Initiative'}
                </option>
                {linkableInitiatives.map((initiative) => (
                  <option key={initiative.id} value={initiative.id}>
                    {initiative.title}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedRole}
                onChange={(event) =>
                  onSelectedRoleChange(
                    event.target.value as InitiativeAttemptRole,
                  )
                }
                disabled={isLinking}
                aria-label="Attempt role"
              >
                {initiativeAttemptRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {initiativeAttemptRoleLabels[role]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                onClick={onAttachToInitiative}
                disabled={attachDisabled}
                size="sm"
              >
                <Link2 className="h-4 w-4" />
                Attach
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Linked Initiatives
            </div>
            {isLoading && linkedInitiatives.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Loading linked Initiatives...
              </div>
            ) : linkedInitiatives.length === 0 ? (
              <div className="rounded-lg border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                This session is not linked to an Initiative.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedInitiatives.map(({ attempt, initiative }) => (
                  <div
                    key={attempt.id}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/30 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {initiative?.title ?? 'Unknown Initiative'}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{initiativeAttemptRoleLabels[attempt.role]}</span>
                        {attempt.isPrimary ? <span>Primary</span> : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onDetachAttempt(attempt.id, attempt.initiativeId)
                      }
                      disabled={isDetaching}
                    >
                      <Unlink className="h-4 w-4" />
                      Detach
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {error ? (
          <div className="border-t border-destructive/30 bg-destructive/10 px-6 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter className="border-t border-border/70 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
