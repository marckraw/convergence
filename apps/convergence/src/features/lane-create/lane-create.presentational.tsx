import type { FC } from 'react'
import { CheckCircle2, GitBranch } from 'lucide-react'
import type { LaneCreateProgressPhase } from '@/entities/project'
import { laneProgressLabel } from '@/entities/project'
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  FormDialog,
  Input,
  Notice,
  Spinner,
} from '@convergence/ui'

export type LaneCreateStage =
  | { kind: 'form' }
  | { kind: 'working'; phase: LaneCreateProgressPhase | null }
  | {
      kind: 'done'
      lanePath: string
      copyMethod: 'clonefile' | 'bytes'
      warnings: string[]
    }

interface LaneCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rootName: string
  baseBranchLabel: string
  laneName: string
  onLaneNameChange: (value: string) => void
  branchName: string
  onBranchNameChange: (value: string) => void
  stage: LaneCreateStage
  error: string | null
  onSubmit: () => void
  onSwitchToLane: () => void
}

/** Why Create lane waits, or nothing when it can go. */
function missingName(laneName: string, branchName: string): string | undefined {
  if (laneName.trim().length === 0) return 'Name the lane first.'
  if (branchName.trim().length === 0) return 'Name the branch first.'
  return undefined
}

export const LaneCreateDialog: FC<LaneCreateDialogProps> = ({
  open,
  onOpenChange,
  rootName,
  baseBranchLabel,
  laneName,
  onLaneNameChange,
  branchName,
  onBranchNameChange,
  stage,
  error,
  onSubmit,
  onSwitchToLane,
}) => {
  const working = stage.kind === 'working'
  const description = `A copy of ${rootName} with its own git and its own sessions, ignored files included.`
  // The copy is not interruptible from here; the door stays open until it
  // has said what happened.
  const handleOpenChange = (next: boolean) => {
    if (working) return
    onOpenChange(next)
  }

  if (stage.kind === 'done') {
    // Made: nothing is left to keep, so it ends in Done (R6).
    return (
      <FormDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="New lane"
        description={description}
        saves="as-you-go"
      >
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-success-ink" />
            <span>
              Lane <span className="font-medium">{laneName}</span> is ready on{' '}
              <span className="font-mono text-xs">{branchName}</span>.
            </span>
          </p>
          <p className="font-mono text-2xs break-all text-ink-muted">
            {stage.lanePath}
          </p>
          {stage.copyMethod === 'bytes' ? (
            <Notice tone="warning" title="Copied byte by byte">
              This volume could not clone, so the files were copied
              byte-by-byte. The lane works the same; it just took longer and
              uses real disk.
            </Notice>
          ) : null}
          {stage.warnings.map((warning) => (
            <Notice key={warning} tone="warning" title={warning} />
          ))}
          <Button type="button" onClick={onSwitchToLane}>
            Switch to lane
          </Button>
        </div>
      </FormDialog>
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="New lane"
      description={description}
      saves="on-save"
      onSave={onSubmit}
      saveLabel="Create lane"
      pendingLabel="Creating…"
      pending={working}
      saveDisabledReason={missingName(laneName, branchName)}
      error={error}
    >
      <div className="space-y-5">
        <Field disabled={working}>
          <FieldLabel>Lane name</FieldLabel>
          <Input
            size="lg"
            value={laneName}
            onChange={(event) => onLaneNameChange(event.target.value)}
            placeholder="studio"
            autoFocus
          />
          <FieldDescription>
            Lowercase letters, digits and hyphens. Shows as “{rootName} · lane:{' '}
            {laneName.trim() || '…'}”.
          </FieldDescription>
        </Field>

        <Field disabled={working}>
          <FieldLabel>Branch name</FieldLabel>
          <Input
            size="lg"
            value={branchName}
            onChange={(event) => onBranchNameChange(event.target.value)}
            placeholder="feat/my-change"
          />
          <FieldDescription>
            If the branch already exists on origin or in {rootName}, it is
            checked out as-is. Otherwise it is created from the base branch. The
            lane starts at the last commit: uncommitted changes in {rootName}{' '}
            are not carried over; ignored files such as .env and node_modules
            are.
          </FieldDescription>
        </Field>

        <section className="space-y-1">
          <span className="text-sm font-medium">Base branch</span>
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <GitBranch className="size-3.5 shrink-0" />
            <span>{baseBranchLabel}</span>
          </p>
        </section>

        {working ? (
          <p
            className="flex items-center gap-2 text-sm text-ink-muted"
            role="status"
          >
            <Spinner />
            <span>{laneProgressLabel(stage.phase)}</span>
          </p>
        ) : null}
      </div>
    </FormDialog>
  )
}
