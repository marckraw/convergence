import { Archive, CheckCheck, MoreHorizontal } from 'lucide-react'
import {
  Button,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  IconButton,
} from '@convergence/ui'
import { SessionActivityCard } from './session-activity-card.presentational'
import type { NeedsYouCardModel } from './needs-you-card.pure'

export interface NeedsYouCardProps {
  card: NeedsYouCardModel
  active?: boolean
  pulsing?: boolean
  onSelect: (id: string) => void
  onPin: (id: string, pinned: boolean) => void
  onDismiss: (id: string) => void
  onArchive: (id: string) => void
}

export function NeedsYouCard({
  card,
  active,
  pulsing,
  onSelect,
  onPin,
  onDismiss,
  onArchive,
}: NeedsYouCardProps) {
  const { session } = card
  return (
    <SessionActivityCard
      card={card}
      active={active}
      pulsing={pulsing}
      onSelect={onSelect}
      footer={
        ((card.dismissLabel && !card.dismissed) || card.canArchive) && (
          <div
            role="group"
            aria-label={`Review actions for ${session.name}`}
            className="flex flex-wrap gap-2 border-t border-border/60 p-2"
          >
            {card.dismissLabel && !card.dismissed && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => onDismiss(session.id)}
                className="flex-1 gap-1.5 border-border/60 bg-card px-2 text-2xs"
              >
                <CheckCheck aria-hidden="true" className="size-3.5" />
                {card.dismissLabel}
              </Button>
            )}
            {card.canArchive && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => onArchive(session.id)}
                className="flex-1 gap-1.5 border-border/60 bg-card px-2 text-2xs"
              >
                <Archive aria-hidden="true" className="size-3.5" />
                Archive
              </Button>
            )}
          </div>
        )
      }
      actions={
        <Menu>
          <MenuTrigger
            render={
              <IconButton
                label={`Actions for ${session.name}`}
                type="button"
                variant="ghost"
                size="lg"
                className="w-10 shrink-0 rounded-lg"
              >
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            }
          />
          <MenuContent align="end">
            <MenuItem onClick={() => onPin(session.id, !session.pinnedAt)}>
              {session.pinnedAt ? 'Unpin' : 'Pin'}
            </MenuItem>
            {card.dismissLabel && !card.dismissed && (
              <MenuItem onClick={() => onDismiss(session.id)}>
                {card.dismissLabel}
              </MenuItem>
            )}
            {card.canArchive && (
              <MenuItem onClick={() => onArchive(session.id)}>Archive</MenuItem>
            )}
          </MenuContent>
        </Menu>
      }
    />
  )
}
