import { ChevronRight, Pin } from 'lucide-react'
import {
  NeedsYouCard,
  type NeedsYouCardModel,
  type NeedsYouCardProps,
} from '@/features/needs-you'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { FoldedGlyphs } from './needs-you-fold-glyphs.presentational'
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
  return (
    <section
      aria-label={title}
      data-section-kind={pinned ? 'pinned' : undefined}
      className={cn(pinned && 'border-l-2 border-foreground/40 pl-2')}
    >
      <h2
        className={cn(
          'mb-1.5 flex items-center gap-1.5 text-[11px] font-medium',
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
          <span>{title}</span>
        </Button>
        {folded && <FoldedGlyphs section={title} cards={cards} />}
        <span className="ml-auto tabular-nums">{cards.length}</span>
      </h2>
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
