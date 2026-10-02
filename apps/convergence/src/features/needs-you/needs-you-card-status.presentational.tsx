import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  LoaderCircle,
  MessageCircle,
} from 'lucide-react'
import { cn, Spinner, Tooltip } from '@convergence/ui'
import type { NeedsYouCardModel } from './needs-you-card.pure'
import { cardStateTone, cardStateToneName } from './needs-you-card-state.styles'
import type { FoldCardState } from './needs-you-fold.pure'

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
  // The glyph's state, in the session's tones (NAV-1): a host out of reach is
  // warning, as Mission Control and the sidebar's rows draw it (MC-1).
  const tinted: FoldCardState | null = card.hostUnreachable
    ? 'unreachable'
    : waiting
      ? 'waiting'
      : failed
        ? 'failed'
        : Icon === CircleCheck
          ? 'finished'
          : null
  return (
    <Tooltip label={card.timing.tooltip}>
      <span
        className={cn(
          'flex items-center gap-1 text-2xs',
          waiting || failed || card.working ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {/* At work, the kit's Spinner (it stands still under reduced
            motion, MC-25) in the working tone; otherwise the state's glyph. */}
        {card.working && Icon === LoaderCircle ? (
          <span data-tone={cardStateToneName.working} className="flex">
            <Spinner size="xs" className={cardStateTone.working} />
          </span>
        ) : (
          <Icon
            aria-hidden="true"
            data-tone={tinted ? cardStateToneName[tinted] : undefined}
            className={cn('size-3 shrink-0', tinted && cardStateTone[tinted])}
          />
        )}
        <span>
          {card.summary}
          {card.timing.label && (
            <>
              {' '}
              <span className="tabular-nums text-ink-muted">
                {card.timing.label}
              </span>
            </>
          )}
        </span>
      </span>
    </Tooltip>
  )
}
