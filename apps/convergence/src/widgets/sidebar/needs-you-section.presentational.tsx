import { Pin } from 'lucide-react'
import {
  cardStateTone,
  foldedSectionSummary,
  NeedsYouCard,
  type NeedsYouCardModel,
  type NeedsYouCardProps,
} from '@/features/needs-you'
import {
  cn,
  Collapsible,
  CollapsiblePanel,
  SectionHeader,
} from '@convergence/ui'
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
      className={cn(pinned && 'border-l-2 border-ink/40 pl-2')}
    >
      {/* The kit's section head (NAV-12): its words open and close the
          cards, and a folded one keeps its glyphs beside its name. */}
      <Collapsible open={!folded} onOpenChange={() => onToggleFold?.(title)}>
        <div className="mb-1.5">
          <SectionHeader
            collapsible
            className={cn(pinned && 'text-ink')}
            label={
              <>
                {pinned && (
                  <Pin
                    aria-hidden="true"
                    data-section-pin=""
                    className="mr-1 inline-block size-3 align-middle"
                  />
                )}
                {/* A fold never hides an ask: the title takes its tone (R4). */}
                <span
                  data-section-title=""
                  className={cn(
                    summary?.urgent && cardStateTone[summary.urgent],
                  )}
                >
                  {title}
                </span>
              </>
            }
            summary={summary && <FoldedGlyphs summary={summary} />}
            count={cards.length}
          />
          {summary && (
            <FoldedLine
              summary={summary}
              className={pinned ? 'pl-8' : 'pl-4'}
            />
          )}
        </div>
        <CollapsiblePanel>
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
        </CollapsiblePanel>
      </Collapsible>
    </section>
  )
}
