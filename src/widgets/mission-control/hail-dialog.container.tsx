import { useMemo } from 'react'
import type { FC } from 'react'
import { Radio } from 'lucide-react'
import { ComposerContainer } from '@/features/composer'
import type { SessionCard } from '@/features/mission-control'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { buildHailComposerContext } from './hail-composer-context.pure'

interface HailDialogProps {
  card: SessionCard | null
  onOpenChange: (open: boolean) => void
}

/**
 * The Hail: the app's real composer, aimed at a card's Session.
 *
 * Composed here at the widget layer on purpose. Mission Control and the
 * composer are sibling features and may not import each other, and a copied
 * composer would be identical for a week and a lie forever after — so the
 * widget owns the modal and puts the genuine `ComposerContainer` inside it.
 * Attachments, skills, delivery modes, provider accounts and mentions are not
 * reimplemented here; they arrive because this is that composer.
 */
export const HailDialog: FC<HailDialogProps> = ({ card, onOpenChange }) => {
  const context = useMemo(
    () => (card ? buildHailComposerContext(card.session) : null),
    [card],
  )

  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(760px,calc(100vw-2rem))] gap-0 p-0">
        <DialogHeader className="border-b border-white/10 px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Radio className="size-4" />
            <span className="truncate">Hail {card?.session.name}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {card
              ? `${card.projectName} · ${card.providerLabel}${
                  card.session.model ? ` · ${card.session.model}` : ''
                } · ${card.activityLabel}`
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {context ? <ComposerContainer context={context} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
