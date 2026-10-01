import {
  parallelWorkStatus,
  type ParallelWorkCounts,
} from '@/shared/lib/parallel-work.pure'
import type { FC } from 'react'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'
import { cn, Spinner, type Tone, toneInk } from '@convergence/ui'

interface SessionBadgeProps {
  parallelWork?: ParallelWorkCounts
  status?: string
  attention: string
  className?: string
  /**
   * The conversation is compacting its context (MAR-3288 R5). The caller
   * answers it with the session entity's `isSessionCompacting`, so this
   * shared glyph never learns what compacting looks like on the record.
   */
  compacting?: boolean
}

export const SessionBadge: FC<SessionBadgeProps> = ({
  attention,
  parallelWork,
  status = 'completed',
  className,
  compacting = false,
}) => {
  const iconClassName = cn('size-3 shrink-0', className)

  // Busy, not finished: the record's attention still reads the last turn's
  // `finished` for the whole compaction.
  if (compacting)
    return (
      <Spinner
        size="xs"
        label="Compacting context…"
        className={cn(className, 'text-muted-foreground')}
      />
    )

  const parallel = parallelWorkStatus({ status, attention, parallelWork })
  if (parallel)
    return (
      <Loader2
        aria-label={parallel}
        className={cn(iconClassName, 'opacity-50 text-muted-foreground')}
      />
    )

  const settled = SETTLED[attention]
  if (settled) {
    const { Glyph, tone } = settled
    return (
      <Glyph data-tone={tone} className={cn(iconClassName, toneInk[tone])} />
    )
  }
  return (
    <Spinner size="xs" className={cn(className, 'text-muted-foreground')} />
  )
}

/**
 * A settled state's glyph and its tone (R1): waiting on you is warning,
 * whether for an approval or an answer; finished is success; failed is
 * danger. Anything else is still at work: the spinner.
 */
const SETTLED: Partial<
  Record<string, { Glyph: typeof CheckCircle2; tone: Tone }>
> = {
  'needs-approval': { Glyph: AlertTriangle, tone: 'warning' },
  'needs-input': { Glyph: MessageSquare, tone: 'warning' },
  finished: { Glyph: CheckCircle2, tone: 'success' },
  failed: { Glyph: XCircle, tone: 'danger' },
}
