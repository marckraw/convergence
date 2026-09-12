import { ProviderModel } from '@/shared/ui/provider-model.presentational'
import { MoreHorizontal, Pin } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { cn } from '@/shared/lib/cn.pure'
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
    <article
      data-pulse={pulsing ? 'true' : undefined}
      className={cn(
        'relative flex min-w-0 items-start rounded-lg bg-card shadow-sm ring-1 ring-border/60 transition-colors hover:bg-accent/50',
        active && 'bg-accent ring-primary/40',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={() => onSelect(session.id)}
        aria-label={[session.name, card.summary, card.projectName]
          .filter(Boolean)
          .join(', ')}
        className="h-auto min-w-0 flex-1 items-start justify-start whitespace-normal rounded-lg p-2 text-left"
      >
        <span className="block min-w-0 w-full space-y-1">
          <span className="flex items-start gap-1 text-xs font-medium">
            <span className="min-w-0 break-words">{session.name}</span>
            {session.pinnedAt && (
              <Pin aria-label="Pinned" className="h-3 w-3 shrink-0" />
            )}
          </span>
          <span
            className="block truncate text-[11px] text-muted-foreground"
            title={card.projectName}
          >
            {card.projectName}
          </span>
          <ProviderModel
            providerId={session.providerId}
            model={session.model}
            className="text-[11px] text-muted-foreground"
          />
          <span className="flex flex-wrap gap-1 text-[10px] font-normal">
            <span className="rounded bg-muted px-1.5 py-0.5">{card.host}</span>
            {card.prLabel && (
              <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                {card.prLabel}
              </span>
            )}
            {card.kind && (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {card.kind}
              </span>
            )}
          </span>
          {card.summary && (
            <span className="block text-[11px] text-muted-foreground">
              {card.summary}
            </span>
          )}
          <span className="block text-[10px] font-normal text-muted-foreground">
            Last moved{' '}
            <time
              title={session.updatedAt}
              dateTime={session.updatedAt}
              className="tabular-nums"
            >
              {card.lastMoved}
            </time>
          </span>
        </span>
      </Button>
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
    </article>
  )
}
