import type { FC } from 'react'
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import type { RelayHopLine, RelayHopTone } from './relay-hop.pure'

const TONE_TEXT: Record<RelayHopTone, string> = {
  delivered: 'text-emerald-400',
  skipped: 'text-muted-foreground',
  alarm: 'text-red-400',
}

const TONE_DOT: Record<RelayHopTone, string> = {
  delivered: 'bg-emerald-400',
  skipped: 'bg-white/25',
  alarm: 'bg-red-400',
}

interface RelayHopRowProps {
  line: RelayHopLine
  expanded: boolean
  onToggle: () => void
}

/**
 * One line of the ledger.
 *
 * Errors say what went wrong right here rather than behind a click -- a
 * failure the user has to expand to read is a failure they will not read. The
 * payload is the only thing folded away, because it is long and rarely the
 * question being asked.
 */
export const RelayHopRow: FC<RelayHopRowProps> = ({
  line,
  expanded,
  onToggle,
}) => {
  const alarm = line.tone === 'alarm'
  const canExpand = line.payloadPreview !== null

  return (
    <li
      data-relay-hop
      className={cn(
        'rounded px-1.5 py-1',
        alarm && 'bg-red-500/10 ring-1 ring-red-500/30',
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] leading-tight">
        <span
          aria-hidden
          className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[line.tone])}
        />
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {line.timeLabel}
        </span>
        <span className="truncate text-foreground">{line.sourceName}</span>
        {line.targetName ? (
          <>
            <ArrowRight
              aria-hidden
              className="size-3 shrink-0 text-muted-foreground"
            />
            <span className="truncate text-foreground">{line.targetName}</span>
          </>
        ) : null}
        <span
          className={cn('ml-auto shrink-0 font-medium', TONE_TEXT[line.tone])}
        >
          {line.outcomeLabel}
        </span>

        {canExpand ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={
              expanded ? 'Hide the message carried' : 'Show the message carried'
            }
            aria-expanded={expanded}
            onClick={onToggle}
            className="size-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </Button>
        ) : null}
      </div>

      {line.error ? (
        <p className="mt-0.5 pl-3 text-[11px] leading-snug text-red-400">
          {line.error}
        </p>
      ) : null}

      {expanded && line.payloadPreview ? (
        <p className="mt-1 rounded bg-black/20 px-2 py-1 text-[11px] leading-snug text-muted-foreground">
          {line.payloadPreview}
        </p>
      ) : null}
    </li>
  )
}
