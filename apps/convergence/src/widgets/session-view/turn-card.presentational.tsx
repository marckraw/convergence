import type { FC } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  Badge,
  cn,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  StatusDot,
} from '@convergence/ui'
import type { Turn, TurnFileChange } from '@/entities/turn'
import { ChangedFilesTree } from './changed-files-tree.container'
import {
  findTurnFileChangeRow,
  type TurnFileChangeRow,
} from './turn-file-change-rows.pure'
import { sumTurnFileCounts, turnFileLabel } from './turn-card.pure'

interface TurnCardProps {
  turn: Turn
  fileChanges: TurnFileChange[]
  /** The same changes as tree rows, carrying the repository each belongs to. */
  fileRows: TurnFileChangeRow[]
  expanded: boolean
  selectedTreePath: string | null
  onToggle: () => void
  onSelectFile: (row: TurnFileChangeRow | null) => void
}

export const TurnCard: FC<TurnCardProps> = ({
  turn,
  fileChanges,
  fileRows,
  expanded,
  selectedTreePath,
  onToggle,
  onSelectFile,
}) => {
  // The derivations live in turn-card.pure.ts (CONV-30): the card draws.
  const counts = sumTurnFileCounts(fileChanges)
  const fileLabel = turnFileLabel(turn.status, fileChanges.length)

  return (
    // The kit's Collapsible, held open from outside (DS-21): its trigger says
    // aria-expanded and names the panel that holds the turn's files.
    <Collapsible
      open={expanded}
      onOpenChange={() => onToggle()}
      className="border-b border-line last:border-b-0"
    >
      <CollapsibleTrigger
        chevron="none"
        className="w-full gap-2 rounded-none px-3 py-2 text-sm hover:bg-highlight hover:text-on-highlight"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'mt-0.5 size-3 shrink-0 transition-transform motion-reduce:transition-none',
            expanded && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-mono text-2xs text-ink-muted">
              Turn {turn.sequence}
            </span>
            {/* R1: a turn under way is working (info); one that errored failed (danger). */}
            {turn.status === 'running' && (
              <Badge
                tone="info"
                shape="label"
                icon={<StatusDot tone="info" size="sm" pulse />}
              >
                in progress
              </Badge>
            )}
            {turn.status === 'errored' && (
              <Badge tone="danger" shape="label">
                errored
              </Badge>
            )}
          </span>
          {turn.summary && (
            <span className="mt-0.5 block truncate text-2xs text-ink">
              {turn.summary}
            </span>
          )}
          <span className="mt-1 flex items-baseline gap-2 text-3xs text-ink-muted">
            <span>{fileLabel}</span>
            {counts.additions > 0 && (
              <span className="text-diff-added">+{counts.additions}</span>
            )}
            {counts.deletions > 0 && (
              <span className="text-diff-removed">−{counts.deletions}</span>
            )}
          </span>
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        {fileChanges.length > 0 ? (
          <div className="h-44 pb-2 pl-4 pr-1">
            <ChangedFilesTree
              files={fileRows.map((row) => ({
                status: row.status,
                file: row.treePath,
              }))}
              selectedFile={selectedTreePath}
              search={false}
              onSelectFile={(treePath) =>
                onSelectFile(findTurnFileChangeRow(fileRows, treePath))
              }
              className="h-full"
            />
          </div>
        ) : null}
      </CollapsiblePanel>
    </Collapsible>
  )
}
