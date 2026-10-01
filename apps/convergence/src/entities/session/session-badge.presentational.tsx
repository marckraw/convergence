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
import { cn, Spinner, toneInk } from '@convergence/ui'
import { attentionTone } from './session-tone.pure'

interface SessionBadgeProps {
  parallelWork?: ParallelWorkCounts
  status?: string
  attention: string
  className?: string
  /**
   * The conversation is compacting its context (MAR-3288 R5). The caller
   * answers it with `isSessionCompacting`, so this glyph never learns what
   * compacting looks like on the record (SessionStateBadge does that).
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

  const tone = attentionTone(attention)
  const Glyph = GLYPHS[attention]
  if (tone && Glyph)
    return (
      <Glyph data-tone={tone} className={cn(iconClassName, toneInk[tone])} />
    )
  return (
    <Spinner size="xs" className={cn(className, 'text-muted-foreground')} />
  )
}

/**
 * A settled state's glyph; its tone is the session's map (session-tone.pure).
 * Anything else, a machine out of reach included, is still at work: the
 * spinner.
 */
const GLYPHS: Partial<Record<string, typeof CheckCircle2>> = {
  'needs-approval': AlertTriangle,
  'needs-input': MessageSquare,
  finished: CheckCircle2,
  failed: XCircle,
}
