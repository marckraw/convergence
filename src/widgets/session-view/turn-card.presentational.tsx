import type { FC } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'
import type { Turn, TurnFileChange } from '@/entities/turn'
import { TurnFileItem } from './turn-file-item.presentational'

interface TurnCardProps {
  turn: Turn
  fileChanges: TurnFileChange[]
  expanded: boolean
  selectedFilePath: string | null
  onToggle: () => void
  onSelectFile: (filePath: string) => void
}

function sumCounts(changes: TurnFileChange[]): {
  additions: number
  deletions: number
} {
  let additions = 0
  let deletions = 0
  for (const change of changes) {
    additions += change.additions
    deletions += change.deletions
  }
  return { additions, deletions }
}

export const TurnCard: FC<TurnCardProps> = ({
  turn,
  fileChanges,
  expanded,
  selectedFilePath,
  onToggle,
  onSelectFile,
}) => {
  const counts = sumCounts(fileChanges)
  const fileLabel =
    fileChanges.length === 0
      ? turn.status === 'running'
        ? 'working…'
        : 'no changes'
      : `${fileChanges.length} file${fileChanges.length === 1 ? '' : 's'}`

  return (
    <div className="border-b border-border last:border-b-0">
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 text-left font-normal"
        onClick={onToggle}
      >
        <ChevronRight
          className={cn(
            'mt-0.5 h-3 w-3 shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              Turn {turn.sequence}
            </span>
            {turn.status === 'running' && (
              <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                in progress
              </span>
            )}
            {turn.status === 'errored' && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                errored
              </span>
            )}
          </span>
          {turn.summary && (
            <span className="mt-0.5 block truncate text-[11px] text-foreground">
              {turn.summary}
            </span>
          )}
          <span className="mt-1 flex items-baseline gap-2 text-[10px] text-muted-foreground">
            <span>{fileLabel}</span>
            {counts.additions > 0 && (
              <span className="text-green-500">+{counts.additions}</span>
            )}
            {counts.deletions > 0 && (
              <span className="text-red-500">−{counts.deletions}</span>
            )}
          </span>
        </span>
      </Button>
      {expanded && fileChanges.length > 0 && (
        <div className="pb-2 pl-4 pr-1">
          {fileChanges.map((change) => (
            <TurnFileItem
              key={change.id}
              fileChange={change}
              selected={selectedFilePath === change.filePath}
              onSelect={() => onSelectFile(change.filePath)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
