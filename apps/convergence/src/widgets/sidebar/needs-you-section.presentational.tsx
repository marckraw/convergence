import { ChevronRight, Pin } from 'lucide-react'
import {
  cardStateTone,
  foldedSectionSummary,
  NeedsYouCard,
  type NeedsYouCardModel,
  type NeedsYouCardProps,
} from '@/features/needs-you'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { FoldedGlyphs } from './needs-you-fold-glyphs.presentational'
import { FoldedLine } from './needs-you-fold-line.presentational'
export interface NeedsYouSectionProps {
  title: string
  cards: NeedsYouCardModel[]
  activeSessionId: string | null
  pulsingSessionIds?: Readonly<Record<string, true>>
  /** Folded: the cards leave the document and the header summarises them. */
  folded?: boolean
  onToggleFold?: (title: string) => void
  onSelect: NeedsYouCardProps['onSelect']
  onPin: NeedsYouCardProps['onPin']
  onDismiss: NeedsYouCardProps['onDismiss']
  onArchive: NeedsYouCardProps['onArchive']
}

export function NeedsYouSection({
  title,
  cards,
  activeSessionId,
  pulsingSessionIds,
  folded = false,
  onToggleFold,
  ...actions
}: NeedsYouSectionProps) {
  // Pinned is the one section Marcin made on purpose (MAR-3366 R2): a pin in
  // its header, the header in foreground, and an accent bar down its cards.
  const pinned = title === 'Pinned'
  // Folded, the header speaks for the cards it hides (MAR-3366 R4, MAR-3372);
  // open, it is title and count only.
  const summary = folded ? foldedSectionSummary(title, cards) : null
  return (
    <section
      aria-label={title}
      data-section-kind={pinned ? 'pinned' : undefined}
      className={cn(pinned && 'border-l-2 border-foreground/40 pl-2')}
    >
      <div className="mb-1.5">
        <h2
          className={cn(
            'flex items-center gap-1.5 text-[11px] font-medium',
            pinned ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <Button
            type="button"
            variant="ghost"
            aria-expanded={!folded}
            onClick={() => onToggleFold?.(title)}
            className="h-auto shrink-0 gap-1 rounded-sm p-0 text-[11px] font-medium hover:bg-transparent hover:text-foreground"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'size-3 shrink-0 transition-transform motion-reduce:transition-none',
                !folded && 'rotate-90',
              )}
            />
            {pinned && (
              <Pin
                aria-hidden="true"
                data-section-pin=""
                className="size-3 shrink-0"
              />
            )}
            {/* A fold never hides an ask: the title takes its tone (R4). */}
            <span
              data-section-title=""
              className={cn(summary?.urgent && cardStateTone[summary.urgent])}
            >
              {title}
            </span>
          </Button>
          {summary && <FoldedGlyphs summary={summary} />}
          <span className="ml-auto tabular-nums">{cards.length}</span>
        </h2>
        {summary && (
          <FoldedLine summary={summary} className={pinned ? 'pl-8' : 'pl-4'} />
        )}
      </div>
      {!folded && (
        <div className="space-y-2">
          {cards.map((card) => (
            <NeedsYouCard
              key={card.session.id}
              card={card}
              active={activeSessionId === card.session.id}
              pulsing={pulsingSessionIds?.[card.session.id]}
              {...actions}
            />
          ))}
        </div>
      )}
    </section>
  )
}
