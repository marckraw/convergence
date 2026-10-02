import type { FC } from 'react'
import { GitBranch, Link2, Plus, Unlink } from 'lucide-react'
import type { Space, SpaceAttempt, SpaceAttemptRole } from '@/entities/space'
import {
  spaceAttemptRoleLabels,
  spaceAttemptRoleOptions,
} from '@/entities/space'
import {
  Button,
  Card,
  EmptyState,
  FormDialog,
  Input,
  ListRow,
  SectionLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@convergence/ui'
import {
  SELECT_EMPTY_VALUE,
  fromSelectValue,
  toSelectValue,
} from '@/shared/lib/select-value.pure'

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
    // Each link, unlink and new Space is kept as it is made, so the dialog
    // ends in Done (R6).
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Session Space"
      description="Link this session as an Attempt in a global Space."
      saves="as-you-go"
      error={error}
    >
      <div className="space-y-5">
        <Card padding="none">
          <ListRow
            leading={<GitBranch className="text-ink-muted" />}
            title={sessionName}
            meta="Current session"
          />
        </Card>

        <section className="space-y-3">
          <SectionLabel as="h3">Create from session</SectionLabel>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!createDisabled) onCreateFromSession()
            }}
          >
            <Input
              size="lg"
              value={createTitle}
              onChange={(event) => onCreateTitleChange(event.target.value)}
              placeholder="Space title"
              aria-label="Space title from session"
              disabled={isCreating}
            />
            <Button type="submit" disabled={createDisabled}>
              <Plus className="size-4" />
              Create
            </Button>
          </form>
        </section>

        <section className="space-y-3">
          <SectionLabel as="h3">Attach to existing</SectionLabel>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Select
              items={{
                [SELECT_EMPTY_VALUE]:
                  linkableSpaces.length === 0
                    ? 'No linkable Spaces'
                    : 'Select Space',
                ...Object.fromEntries(
                  linkableSpaces.map((space) => [space.id, space.title]),
                ),
              }}
              value={toSelectValue(selectedSpaceId)}
              onValueChange={(spaceId) =>
                onSelectedSpaceChange(fromSelectValue(spaceId))
              }
              disabled={linkableSpaces.length === 0 || isLinking}
            >
              <SelectTrigger
                size="lg"
                className="w-full min-w-0 sm:flex-1"
                aria-label="Existing Space"
              >
                <SelectValue
                  placeholder={
                    linkableSpaces.length === 0
                      ? 'No linkable Spaces'
                      : 'Select Space'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_EMPTY_VALUE} disabled>
                  {linkableSpaces.length === 0
                    ? 'No linkable Spaces'
                    : 'Select Space'}
                </SelectItem>
                {linkableSpaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={spaceAttemptRoleLabels}
              value={selectedRole}
              onValueChange={(role) =>
                onSelectedRoleChange(role as SpaceAttemptRole)
              }
              disabled={isLinking}
            >
              <SelectTrigger
                size="lg"
                aria-label="Attempt role"
                className="w-full sm:w-40"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spaceAttemptRoleOptions.map((role) => (
                  <SelectItem key={role} value={role}>
                    {spaceAttemptRoleLabels[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={onAttachToSpace}
              disabled={attachDisabled}
            >
              <Link2 className="size-4" />
              Attach
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <SectionLabel as="h3">Linked Spaces</SectionLabel>
          {isLoading && linkedSpaces.length === 0 ? (
            <EmptyState state="loading" title="Loading linked Spaces…" />
          ) : linkedSpaces.length === 0 ? (
            <EmptyState
              title="No linked Spaces"
              detail="This session is not linked to a Space."
            />
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
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span>{spaceAttemptRoleLabels[attempt.role]}</span>
                      {attempt.isPrimary ? <span>Primary</span> : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onDetachAttempt(attempt.id, attempt.spaceId)}
                    disabled={isDetaching}
                  >
                    <Unlink className="size-4" />
                    Detach
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </FormDialog>
  )
}
