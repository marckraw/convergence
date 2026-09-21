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
import { cn } from '@/shared/lib/cn.pure'

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
      <Loader2
        aria-label="Compacting context…"
        className={cn(iconClassName, 'animate-spin text-muted-foreground')}
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

  switch (attention) {
    case 'needs-approval':
      return <AlertTriangle className={cn(iconClassName, 'text-warning')} />
    case 'needs-input':
      return <MessageSquare className={cn(iconClassName, 'text-blue-500')} />
    case 'finished':
      return <CheckCircle2 className={cn(iconClassName, 'text-emerald-500')} />
    case 'failed':
      return <XCircle className={cn(iconClassName, 'text-red-500')} />
    default:
      return (
        <Loader2
          className={cn(iconClassName, 'animate-spin text-muted-foreground')}
        />
      )
  }
}
