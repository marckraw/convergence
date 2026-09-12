import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import { resolveProviderIcon } from '@/shared/ui/provider-icon.pure'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { isLocalExecutionHost } from '@/entities/execution-host'
import { NeedsYouCardIcon } from './needs-you-card-icon.presentational'
import { NeedsYouCardStatus } from './needs-you-card-status.presentational'
import { providerCardTints } from './needs-you-card.styles'
import type { CSSProperties } from 'react'
import './needs-you-card.css'
import {
  BriefcaseBusiness,
  Infinity as InfinityIcon,
  Laptop,
  Server,
  MoreHorizontal,
  Pin,
} from 'lucide-react'
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
  const provider = resolveProviderIcon(session.providerId)
  const HostIcon = isLocalExecutionHost(session.executionHost) ? Laptop : Server
  const KindIcon = card.kind === 'resident' ? InfinityIcon : BriefcaseBusiness
  return (
    <article
      data-pulse={pulsing ? 'true' : undefined}
      style={
        {
          '--needs-you-provider-tint': provider.brand
            ? providerCardTints[provider.brand]
            : undefined,
        } as CSSProperties
      }
      className={cn(
        'needs-you-card relative flex min-w-0 items-start rounded-lg shadow-sm ring-1 ring-border/60 transition-colors',
        active && 'ring-2 ring-foreground/70',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={() => onSelect(session.id)}
        aria-label={[session.name, card.summary, card.projectName]
          .filter(Boolean)
          .join(', ')}
        className="h-auto min-w-0 flex-1 items-start justify-start whitespace-normal rounded-lg p-2 text-left hover:bg-transparent hover:text-foreground"
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
          <span
            className="block break-words text-[11px] text-foreground"
            title={session.model || 'Model not recorded'}
          >
            {session.model || 'Model not recorded'}
          </span>
          {card.prLabel && (
            <span className="flex flex-wrap gap-1 text-[10px] font-normal">
              <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                {card.prLabel}
              </span>
            </span>
          )}
          <NeedsYouCardStatus card={card} />
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
      <TooltipProvider delayDuration={200}>
        <div className="flex w-10 shrink-0 flex-col items-center pb-1">
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
          <NeedsYouCardIcon label={provider.label}>
            <ProviderIcon providerId={session.providerId} title="" />
          </NeedsYouCardIcon>
          <NeedsYouCardIcon label={card.host}>
            <HostIcon aria-hidden="true" className="size-4" />
          </NeedsYouCardIcon>
          {card.kind && (
            <NeedsYouCardIcon
              label={card.kind === 'resident' ? 'Resident' : 'Errand'}
            >
              <KindIcon aria-hidden="true" className="size-4" />
            </NeedsYouCardIcon>
          )}
        </div>
      </TooltipProvider>
    </article>
  )
}
