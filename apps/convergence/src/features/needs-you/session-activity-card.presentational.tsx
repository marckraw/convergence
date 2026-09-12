import type { CSSProperties, ReactNode } from 'react'
import {
  ClipboardList,
  Infinity as InfinityIcon,
  Laptop,
  Loader2,
  Pin,
  Server,
} from 'lucide-react'
import { isLocalExecutionHost } from '@/entities/execution-host'
import { Button } from '@/shared/ui/button'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import { resolveProviderIcon } from '@/shared/ui/provider-icon.pure'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'
import { TooltipProvider } from '@/shared/ui/tooltip'
import { cn } from '@/shared/lib/cn.pure'
import { NeedsYouCardIcon } from './needs-you-card-icon.presentational'
import { NeedsYouCardStatus } from './needs-you-card-status.presentational'
import { NeedsYouPr } from './needs-you-pr.presentational'
import { providerCardTints } from './needs-you-card.styles'
import type { NeedsYouCardModel } from './needs-you-card.pure'
import './needs-you-card.css'

interface SessionActivityCardProps {
  card: NeedsYouCardModel
  active?: boolean
  compact?: boolean
  pulsing?: boolean
  regeneratingName?: boolean
  selectionLabel?: string
  actions: ReactNode
  onSelect: (id: string) => void
  onRename?: () => void
}

/** Shared card presentation; the owning surface supplies its existing actions. */
export function SessionActivityCard({
  card,
  active,
  compact = false,
  pulsing,
  regeneratingName,
  selectionLabel,
  actions,
  onSelect,
  onRename,
}: SessionActivityCardProps) {
  const { session } = card
  const provider = resolveProviderIcon(session.providerId)
  const HostIcon = isLocalExecutionHost(session.executionHost) ? Laptop : Server
  const KindIcon = card.kind === 'resident' ? InfinityIcon : ClipboardList

  return (
    <article
      data-pulse={pulsing ? 'true' : undefined}
      data-density={compact ? 'compact' : 'expanded'}
      style={
        {
          '--needs-you-provider-tint': provider.brand
            ? providerCardTints[provider.brand]
            : undefined,
        } as CSSProperties
      }
      className={cn(
        'needs-you-card relative flex min-w-0 items-start rounded-lg shadow-sm ring-1 ring-border/60 transition-colors',
        active && 'ring-foreground/25',
      )}
    >
      <div className="min-w-0 flex-1 p-2 text-left">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onSelect(session.id)}
          onDoubleClick={onRename}
          title={[
            session.name,
            regeneratingName ? 'Regenerating name…' : null,
            card.summary,
            card.timing.tooltip,
          ]
            .filter(Boolean)
            .join('\n')}
          aria-label={
            selectionLabel ??
            [session.name, card.summary, card.projectName]
              .filter(Boolean)
              .join(', ')
          }
          aria-current={active ? 'true' : undefined}
          className={cn(
            'static h-auto min-w-0 w-full items-start justify-start whitespace-normal rounded-lg p-0 text-left after:absolute after:inset-0 after:rounded-lg hover:bg-transparent hover:text-foreground',
            compact && 'flex',
          )}
        >
          <span className="block min-w-0 w-full space-y-1">
            <span className="flex items-start gap-1 text-xs font-medium">
              {compact && (
                <SessionBadge
                  attention={session.attention}
                  status={session.status}
                  parallelWork={session.parallelWork}
                  className="mt-0.5"
                />
              )}
              <span
                className={compact ? 'min-w-0 truncate' : 'min-w-0 break-words'}
              >
                {session.name}
              </span>
              {session.pinnedAt && (
                <Pin
                  aria-label="Pinned"
                  className={compact ? 'size-3 shrink-0' : 'h-3 w-3 shrink-0'}
                />
              )}
              {regeneratingName && (
                <Loader2
                  aria-label="Regenerating name"
                  className="size-3 shrink-0 animate-spin motion-reduce:animate-none"
                />
              )}
            </span>
            {!compact && (
              <span
                className="block truncate text-[11px] text-muted-foreground"
                title={card.projectName}
              >
                {card.projectName}
              </span>
            )}
            {!compact && (
              <span
                className="block break-words text-[11px] text-foreground"
                title={session.model || 'Model not recorded'}
              >
                {session.model || 'Model not recorded'}
              </span>
            )}
          </span>
        </Button>
        {compact && (
          <TooltipProvider delayDuration={200}>
            <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-normal leading-3 text-muted-foreground">
              <NeedsYouCardIcon label={provider.label} compact>
                <ProviderIcon
                  providerId={session.providerId}
                  title=""
                  className="size-3"
                />
              </NeedsYouCardIcon>
              <span
                className="min-w-0 flex-1 truncate"
                title={session.model || 'Model not recorded'}
              >
                {session.model || 'Model not recorded'}
              </span>
              <NeedsYouCardIcon label={card.host} compact>
                <HostIcon aria-hidden="true" className="size-3" />
              </NeedsYouCardIcon>
              {card.kind && (
                <NeedsYouCardIcon
                  label={card.kind === 'resident' ? 'Resident' : 'Errand'}
                  compact
                >
                  <KindIcon aria-hidden="true" className="size-3" />
                </NeedsYouCardIcon>
              )}
            </div>
          </TooltipProvider>
        )}
        {!compact && (
          <div className="mt-1 space-y-1">
            {session.pullRequest && (
              <TooltipProvider delayDuration={200}>
                <NeedsYouPr pr={session.pullRequest} />
              </TooltipProvider>
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
          </div>
        )}
      </div>
      <TooltipProvider delayDuration={200}>
        <div
          className={cn(
            'relative z-10 flex w-10 shrink-0 flex-col items-center',
            compact ? 'py-1' : 'pb-1',
          )}
        >
          {actions}
          {!compact && (
            <>
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
            </>
          )}
        </div>
      </TooltipProvider>
    </article>
  )
}
