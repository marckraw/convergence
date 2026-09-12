import {
  NeedsYouCard,
  type NeedsYouCardModel,
  type NeedsYouCardProps,
} from '@/features/needs-you'
export interface NeedsYouSectionProps {
  title: string
  cards: NeedsYouCardModel[]
  activeSessionId: string | null
  pulsingSessionIds?: Readonly<Record<string, true>>
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
  ...actions
}: NeedsYouSectionProps) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1.5 flex justify-between gap-2 text-[11px] font-medium text-muted-foreground">
        <span>{title}</span>
        <span className="tabular-nums">{cards.length}</span>
      </h2>
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
    </section>
  )
}
