import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'

interface DiffViewerProps {
  file: string | null
  diff: string
  loading?: boolean
}

export const DiffViewer: FC<DiffViewerProps> = ({
  file,
  diff,
  loading = false,
}) => {
  if (!file) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
        Select a changed file to inspect its working tree diff.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-3 text-xs text-muted-foreground">Loading diff...</div>
    )
  }

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
          Current workspace diff
        </p>
      </div>
      <pre className="app-scrollbar min-h-0 flex-1 overflow-auto bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {diff.split('\n').map((line, i) => (
          <div
            key={i}
            className={cn(
              line.startsWith('+') &&
                !line.startsWith('+++') &&
                'text-green-500',
              line.startsWith('-') && !line.startsWith('---') && 'text-red-500',
              line.startsWith('@@') && 'text-blue-500',
            )}
          >
            {line}
          </div>
        ))}
      </pre>
    </div>
  )
}
