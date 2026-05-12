import type { FC } from 'react'
import { GitBranch, Link2, Plus, Unlink } from 'lucide-react'
import type { Space, SpaceAttempt, SpaceAttemptRole } from '@/entities/space'
import {
  spaceAttemptRoleLabels,
  spaceAttemptRoleOptions,
} from '@/entities/space'
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

export interface LinkedSpaceView {
  attempt: SpaceAttempt
  space: Space | null
}

interface SpaceSessionLinkDialogProps {
  open: boolean
  sessionName: string
  spaces: Space[]
  linkedSpaces: LinkedSpaceView[]
  createTitle: string
  selectedSpaceId: string
  selectedRole: SpaceAttemptRole
  isLoading: boolean
  isCreating: boolean
  isLinking: boolean
  isDetaching: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onCreateTitleChange: (value: string) => void
  onSelectedSpaceChange: (id: string) => void
  onSelectedRoleChange: (role: SpaceAttemptRole) => void
  onCreateFromSession: () => void
  onAttachToSpace: () => void
  onDetachAttempt: (attemptId: string, spaceId: string) => void
}

export const SpaceSessionLinkDialog: FC<SpaceSessionLinkDialogProps> = ({
  open,
  sessionName,
  spaces,
  linkedSpaces,
  createTitle,
  selectedSpaceId,
  selectedRole,
  isLoading,
  isCreating,
  isLinking,
  isDetaching,
  error,
  onOpenChange,
  onCreateTitleChange,
  onSelectedSpaceChange,
  onSelectedRoleChange,
  onCreateFromSession,
  onAttachToSpace,
  onDetachAttempt,
}) => {
  const linkedSpaceIds = new Set(
    linkedSpaces.map((entry) => entry.attempt.spaceId),
  )
  const linkableSpaces = spaces.filter((space) => !linkedSpaceIds.has(space.id))
  const createDisabled = createTitle.trim().length === 0 || isCreating
  const attachDisabled =
    selectedSpaceId.length === 0 || isLinking || linkableSpaces.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>Session Space</DialogTitle>
          <DialogDescription>
            Link this session as an Attempt in a global Space.
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
                placeholder="Space title"
                aria-label="Space title from session"
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
                value={selectedSpaceId}
                onChange={(event) => onSelectedSpaceChange(event.target.value)}
                disabled={linkableSpaces.length === 0 || isLinking}
                aria-label="Existing Space"
              >
                <option value="">
                  {linkableSpaces.length === 0
                    ? 'No linkable Spaces'
                    : 'Select Space'}
                </option>
                {linkableSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.title}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedRole}
                onChange={(event) =>
                  onSelectedRoleChange(event.target.value as SpaceAttemptRole)
                }
                disabled={isLinking}
                aria-label="Attempt role"
              >
                {spaceAttemptRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {spaceAttemptRoleLabels[role]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                onClick={onAttachToSpace}
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
              Linked Spaces
            </div>
            {isLoading && linkedSpaces.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Loading linked Spaces...
              </div>
            ) : linkedSpaces.length === 0 ? (
              <div className="rounded-lg border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                This session is not linked to a Space.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedSpaces.map(({ attempt, space }) => (
                  <div
                    key={attempt.id}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/30 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {space?.title ?? 'Unknown Space'}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{spaceAttemptRoleLabels[attempt.role]}</span>
                        {attempt.isPrimary ? <span>Primary</span> : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onDetachAttempt(attempt.id, attempt.spaceId)
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
