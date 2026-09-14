import { Archive, CheckCheck, MoreHorizontal } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
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
        card.attentionGroup === 'Needs review' && (
          <div
            role="group"
            aria-label={`Review actions for ${session.name}`}
            className="flex flex-wrap gap-2 border-t border-border/60 p-2"
          >
            {!card.dismissed && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 border-border/60 bg-card px-2 text-[11px]"
                onClick={() => onDismiss(session.id)}
              >
                <CheckCheck aria-hidden="true" className="size-3.5" />
                Acknowledge
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 border-border/60 bg-card px-2 text-[11px]"
              onClick={() => onArchive(session.id)}
            >
              <Archive aria-hidden="true" className="size-3.5" />
              Archive
            </Button>
          </div>
        )
      }
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-lg"
              aria-label={`Actions for ${session.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => onPin(session.id, !session.pinnedAt)}
            >
              {session.pinnedAt ? 'Unpin' : 'Pin'}
            </DropdownMenuItem>
            {card.dismissLabel && !card.dismissed && (
              <DropdownMenuItem onSelect={() => onDismiss(session.id)}>
                {card.dismissLabel}
              </DropdownMenuItem>
            )}
            {card.canArchive && (
              <DropdownMenuItem onSelect={() => onArchive(session.id)}>
                Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  )
}
