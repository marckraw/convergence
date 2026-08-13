import type { FC, ReactNode } from 'react'
import { Satellite, SearchX } from 'lucide-react'
import { Input } from '@/shared/ui/input'

interface MissionControlViewProps {
  totalCount: number
  visibleCount: number
  attentionCount: number
  runningCount: number
  query: string
  onQueryChange: (query: string) => void
  children: ReactNode
}

export const MissionControlView: FC<MissionControlViewProps> = ({
  totalCount,
  visibleCount,
  attentionCount,
  runningCount,
  query,
  onQueryChange,
  children,
}) => {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Satellite className="size-4" />
            Mission Control
          </h1>
          <p className="text-xs text-muted-foreground">
            {totalCount === 0
              ? 'no sessions'
              : `${totalCount} session${totalCount === 1 ? '' : 's'} · ${attentionCount} need${attentionCount === 1 ? 's' : ''} you · ${runningCount} running`}
          </p>
        </div>

        <Input
          type="search"
          value={query}
          placeholder="Search cards by name, project, provider, model, status…"
          aria-label="Search session cards"
          className="h-8 w-full max-w-xs text-xs"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {totalCount === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Satellite className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No sessions yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Start a session in any project and its card will appear here,
              live.
            </p>
          </div>
        ) : visibleCount === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <SearchX className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No cards match “{query}”</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Card search covers name, project, provider, model, status and
              activity — not conversation content.
            </p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
