import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  LoaderCircle,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import type { NeedsYouCardModel } from './needs-you-card.pure'
import { cardStateTone } from './needs-you-card-state.styles'

export function NeedsYouCardStatus({ card }: { card: NeedsYouCardModel }) {
  if (!card.summary) return null

  const waiting = card.attentionGroup === 'Waiting on you'
  const failed =
    !card.hostUnreachable &&
    (card.session.attention === 'failed' || card.session.status === 'failed')
  const Icon = card.hostUnreachable
    ? CircleHelp
    : waiting
      ? MessageCircle
      : failed
        ? CircleAlert
        : card.working
          ? LoaderCircle
          : card.session.parallelWork?.unknown
            ? CircleHelp
            : CircleCheck
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-[11px]',
        waiting || failed || card.working
          ? 'text-foreground'
          : 'text-muted-foreground',
      )}
      title={card.timing.tooltip}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-3 shrink-0', {
          [cardStateTone.finished]: Icon === CircleCheck,
          [cardStateTone.waiting]: waiting,
          [cardStateTone.failed]: failed,
          [`animate-spin ${cardStateTone.working} motion-reduce:animate-none`]:
            card.working,
        })}
      />
      <span>
        {card.summary}
        {card.timing.label && (
          <>
            {' '}
            <span className="tabular-nums text-muted-foreground">
              {card.timing.label}
            </span>
          </>
        )}
      </span>
    </span>
  )
}
