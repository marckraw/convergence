import type { FC, MouseEvent } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { parseUnifiedDiff, type DiffLine } from './diff-lines.pure'

interface DiffViewerProps {
  file: string | null
  diff: string
  loading?: boolean
  emptyMessage?: string
  title?: string
  lines?: DiffLine[]
  selectedLineIds?: string[]
  onLineClick?: (line: DiffLine, event: MouseEvent<HTMLButtonElement>) => void
}

export const DiffViewer: FC<DiffViewerProps> = ({
  file,
  diff,
  loading = false,
  emptyMessage = 'Select a changed file to inspect its working tree diff.',
  title = 'Current workspace diff',
  lines,
  selectedLineIds = [],
  onLineClick,
}) => {
  if (!file) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-3 text-xs text-muted-foreground">Loading diff...</div>
    )
  }

  const diffLines = lines ?? parseUnifiedDiff(diff)
  const selected = new Set(selectedLineIds)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <p
          title={file}
          className="truncate font-mono text-[11px] text-foreground"
        >
          {file}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      </div>
      <div className="app-scrollbar min-h-0 flex-1 overflow-auto bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {diffLines.length === 0 ? (
          <div>(no diff available)</div>
        ) : (
          diffLines.map((line) => {
            const isSelectable = !!onLineClick
            const isSelected = selected.has(line.id)
            const className = cn(
              'grid min-w-full grid-cols-[3rem_3rem_minmax(0,1fr)] items-start justify-start gap-2 rounded-sm px-1 py-0 text-left font-mono text-[11px] leading-relaxed whitespace-pre',
              isSelectable && 'cursor-pointer hover:bg-muted/50',
              isSelected &&
                'bg-primary/15 outline outline-1 outline-primary/50',
              line.kind === 'add' && 'text-green-500',
              line.kind === 'delete' && 'text-red-500',
              line.kind === 'hunk' && 'text-blue-500',
              (line.kind === 'file' || line.kind === 'meta') &&
                'text-muted-foreground/80',
            )
            const content = (
              <>
                <span className="select-none text-right text-muted-foreground/60">
                  {formatLineNumber(line.oldLine)}
                </span>
                <span className="select-none text-right text-muted-foreground/60">
                  {formatLineNumber(line.newLine)}
                </span>
                <span>{line.text}</span>
              </>
            )

            if (!isSelectable) {
              return (
                <div key={line.id} className={className}>
                  {content}
                </div>
              )
            }

            return (
              <Button
                key={line.id}
                type="button"
                variant="ghost"
                className={cn('h-auto', className)}
                onClick={
                  onLineClick ? (event) => onLineClick(line, event) : undefined
                }
              >
                {content}
              </Button>
            )
          })
        )}
      </div>
    </div>
  )
}

function formatLineNumber(line: number | null): string {
  return line === null ? '' : String(line)
}
