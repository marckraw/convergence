import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import type { NeedsYouCardModel } from './needs-you-card.pure'

export function NeedsYouCardStatus({ card }: { card: NeedsYouCardModel }) {
  if (!card.summary) return null

  const waiting = card.attentionGroup === 'Waiting on you'
  const failed = card.session.attention === 'failed'
  const Icon = waiting
    ? MessageCircle
    : failed
      ? CircleAlert
      : card.working
        ? LoaderCircle
        : CircleCheck
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-[11px]',
        waiting || failed || card.working
          ? 'text-foreground'
          : 'text-muted-foreground',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-3 shrink-0', {
          'text-warning-foreground': waiting,
          'text-destructive': failed,
          'animate-spin text-blue-600 dark:text-blue-400 motion-reduce:animate-none':
            card.working,
        })}
      />
      <span>{card.summary}</span>
    </span>
  )
}
