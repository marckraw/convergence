import {
  parallelWorkStatus,
  type ParallelWorkCounts,
} from '@/shared/lib/parallel-work.pure'
import type { FC } from 'react'
import {
  Loader2,
  CheckCircle2,
  CircleHelp,
  XCircle,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'
import { cn, Spinner, toneInk } from '@convergence/ui'
import { attentionTone, SESSION_STATE_TONE } from './session-tone.pure'

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
      <span
        role="img"
        aria-label="Compacting context…"
        className={cn('inline-flex shrink-0', className)}
      >
        <Spinner size="xs" className="text-ink-muted" />
      </span>
    )

  const parallel = parallelWorkStatus({ status, attention, parallelWork })
  if (parallel)
    return (
      <Loader2
        aria-label={parallel}
        className={cn(iconClassName, 'opacity-50 text-ink-muted')}
      />
    )

  const tone = attentionTone(attention)
  const Glyph = GLYPHS[attention]
  if (tone && Glyph)
    return (
      <Glyph data-tone={tone} className={cn(iconClassName, toneInk[tone])} />
    )
  // At work: the spinner, in the working tone (R1: working is info), as the
  // Activity feed and Mission Control draw it (MC-1).
  const working = SESSION_STATE_TONE.working
  return (
    <span data-tone={working} className={cn('inline-flex shrink-0', className)}>
      <Spinner size="xs" className={toneInk[working]} />
    </span>
  )
}

/**
 * A state's glyph; its tone is the session's map (session-tone.pure). A
 * machine out of reach has its own, "we cannot see it", in the warning tone
 * (R1, NAV-1), never the working spinner. Anything else is still at work:
 * the spinner.
 */
const GLYPHS: Partial<Record<string, typeof CheckCircle2>> = {
  'needs-approval': AlertTriangle,
  'needs-input': MessageSquare,
  finished: CheckCircle2,
  failed: XCircle,
  'host-unreachable': CircleHelp,
}
