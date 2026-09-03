import type { FC } from 'react'
import { CheckCircle2, GitBranch, Loader2 } from 'lucide-react'
import type { LaneCreateProgressPhase } from '@/entities/project'
import { laneProgressLabel } from '@/entities/project'
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
  const canSubmit =
    stage.kind === 'form' &&
    laneName.trim().length > 0 &&
    branchName.trim().length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The copy is not interruptible from here; the door stays open until
        // it has said what happened.
        if (working) return
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <DialogTitle>New lane</DialogTitle>
          <DialogDescription>
            A copy of {rootName} with its own git and its own sessions, ignored
            files included.
          </DialogDescription>
        </DialogHeader>

        {stage.kind === 'done' ? (
          <div className="space-y-4 px-6 py-5">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>
                Lane <span className="font-medium">{laneName}</span> is ready on{' '}
                <span className="font-mono text-xs">{branchName}</span>.
              </span>
            </p>
            <p className="break-all font-mono text-[11px] text-muted-foreground">
              {stage.lanePath}
            </p>
            {stage.copyMethod === 'bytes' ? (
              <p className="rounded-md border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                This volume could not clone, so the files were copied
                byte-by-byte. The lane works the same; it just took longer and
                uses real disk.
              </p>
            ) : null}
            {stage.warnings.map((warning) => (
              <p
                key={warning}
                className="rounded-md border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                {warning}
              </p>
            ))}
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (canSubmit) onSubmit()
            }}
          >
            <div className="space-y-5 overflow-y-auto px-6 py-5">
              <section className="space-y-2">
                <label htmlFor="lane-name" className="text-sm font-medium">
                  Lane name
                </label>
                <Input
                  id="lane-name"
                  value={laneName}
                  onChange={(event) => onLaneNameChange(event.target.value)}
                  placeholder="studio"
                  autoFocus
                  disabled={working}
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, digits and hyphens. Shows as “{rootName} ·
                  lane: {laneName.trim() || '…'}”.
                </p>
              </section>

              <section className="space-y-2">
                <label htmlFor="lane-branch" className="text-sm font-medium">
                  Branch name
                </label>
                <Input
                  id="lane-branch"
                  value={branchName}
                  onChange={(event) => onBranchNameChange(event.target.value)}
                  placeholder="feat/my-change"
                  disabled={working}
                />
                <p className="text-xs text-muted-foreground">
                  If the branch already exists on origin or in {rootName}, it is
                  checked out as-is. Otherwise it is created from the base
                  branch. The lane starts at the last commit: uncommitted
                  changes in {rootName} are not carried over; ignored files such
                  as .env and node_modules are.
                </p>
              </section>

              <section className="space-y-1">
                <span className="text-sm font-medium">Base branch</span>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                  <span>{baseBranchLabel}</span>
                </p>
              </section>

              {working ? (
                <p
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{laneProgressLabel(stage.phase)}</span>
                </p>
              ) : null}

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
                disabled={working}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {working ? 'Creating…' : 'Create lane'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {stage.kind === 'done' ? (
          <DialogFooter className="border-t border-white/10 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button type="button" onClick={onSwitchToLane}>
              Switch to lane
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
