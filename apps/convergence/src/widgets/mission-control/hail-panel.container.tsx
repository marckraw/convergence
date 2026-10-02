import { useMemo } from 'react'
import type { FC } from 'react'
import { Radio, X } from 'lucide-react'
import { ComposerContainer } from '@/features/composer'
import type { SessionCard } from '@/features/mission-control'
import { IconButton } from '@convergence/ui'
import { buildHailComposerContext } from './hail-composer-context.pure'

interface HailPanelProps {
  card: SessionCard
  onClose: () => void
}

/**
 * The Hail: the app's real composer, aimed at a card's Session, opening in
 * place under the card's row so the room stays visible around it.
 *
 * Composed here at the widget layer on purpose. Mission Control and the
 * composer are sibling features and may not import each other, and a copied
 * composer would be identical for a week and a lie forever after — so the
 * widget owns the panel and puts the genuine `ComposerContainer` inside it.
 * Attachments, skills, delivery modes, provider accounts and mentions are not
 * reimplemented here; they arrive because this is that composer.
 */
export const HailPanel: FC<HailPanelProps> = ({ card, onClose }) => {
  const context = useMemo(
    () => buildHailComposerContext(card.session),
    [card.session],
  )

  return (
    <div className="col-span-full rounded-lg border border-hairline-strong bg-surface/60">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="size-4 shrink-0" />
          <span className="truncate text-sm font-medium">
            Hail {card.session.name}
          </span>
          <span className="truncate text-2xs text-ink-muted">
            {card.projectName} · {card.providerLabel}
            {card.session.model ? ` · ${card.session.model}` : ''} ·{' '}
            {card.activityLabel}
          </span>
        </div>

        <IconButton
          label="Close hail"
          type="button"
          variant="ghost"
          onClick={onClose}
          size="sm"
          className="shrink-0"
        >
          <X className="size-4" />
        </IconButton>
      </div>

      <div className="px-4 py-3">
        <ComposerContainer context={context} />
      </div>
    </div>
  )
}
