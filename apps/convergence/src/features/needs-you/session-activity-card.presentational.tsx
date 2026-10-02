import { SessionStateBadge } from '@/entities/session'
import type { CSSProperties, ReactNode } from 'react'
import {
  ClipboardList,
  Infinity as InfinityIcon,
  Laptop,
  Pin,
  Server,
} from 'lucide-react'
import { isLocalExecutionHost } from '@/entities/execution-host'
import { Card, CardAction, cn, Spinner, Tooltip } from '@convergence/ui'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import { resolveProviderIcon } from '@/shared/ui/provider-icon.pure'
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
  footer?: ReactNode
  onSelect: (id: string) => void
  onRename?: () => void
}

/**
 * Shared card presentation; the owning surface supplies its existing actions.
 * It is the kit's Card, its door a CardAction stretched over the whole card
 * (MC-2, MC-12): one tab stop, the kit's focus ring round the card, and the
 * card's other controls raised above the door. Its surface stays its own:
 * the provider's wash and its hover (needs-you-card.css), and its ring.
 */
export function SessionActivityCard({
  card,
  active,
  compact = false,
  pulsing,
  regeneratingName,
  selectionLabel,
  actions,
  footer,
  onSelect,
  onRename,
}: SessionActivityCardProps) {
  const { session } = card
  const provider = resolveProviderIcon(session.providerId)
  const HostIcon = isLocalExecutionHost(session.executionHost) ? Laptop : Server
  const KindIcon = card.kind === 'resident' ? InfinityIcon : ClipboardList

  return (
    <Card
      render={<article />}
      interactive
      // The open conversation: aria-current on the door. Its look is the
      // ring below, not the selected fill, which the wash keeps out (R0).
      selected={active}
      padding="none"
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
        'needs-you-card flex min-w-0 flex-wrap items-start border-0 bg-(--needs-you-card-surface) shadow-control ring-1 ring-line-soft hover:bg-(--needs-you-card-hover)',
        active && 'ring-ink/25',
      )}
    >
      <div className="min-w-0 flex-1 p-2 text-left">
        <Tooltip
          label={[
            session.name,
            regeneratingName ? 'Regenerating name…' : null,
            card.summary,
            card.timing.tooltip,
          ]
            .filter(Boolean)
            .join('\n')}
        >
          <CardAction
            onClick={() => onSelect(session.id)}
            onDoubleClick={onRename}
            aria-label={
              selectionLabel ??
              [session.name, card.summary, card.projectName]
                .filter(Boolean)
                .join(', ')
            }
            className="flex w-full min-w-0 items-start font-medium"
          >
            <span className="block min-w-0 w-full space-y-1">
              <span className="flex items-start gap-1 text-xs font-medium">
                {compact && !card.hostUnreachable && (
                  <SessionStateBadge session={session} className="mt-0.5" />
                )}
                <span
                  className={
                    compact ? 'min-w-0 truncate' : 'min-w-0 break-words'
                  }
                >
                  {session.name}
                </span>
                {session.pinnedAt && (
                  <Pin
                    aria-label="Pinned"
                    // 16 px open, as the button it sat in drew it (R0).
                    className={compact ? 'size-3 shrink-0' : 'size-4 shrink-0'}
                  />
                )}
                {regeneratingName && (
                  <span role="img" aria-label="Regenerating name">
                    <Spinner size="xs" />
                  </span>
                )}
              </span>
              {!compact && (
                <Tooltip label={card.projectName} when="truncated">
                  <span className="block truncate text-2xs text-ink-muted">
                    {card.projectName}
                  </span>
                </Tooltip>
              )}
              {!compact && (
                <span className="block break-words text-2xs text-ink">
                  {session.model || 'Model not recorded'}
                </span>
              )}
            </span>
          </CardAction>
        </Tooltip>
        {compact && (
          <div className="mt-1 flex min-w-0 items-center gap-1 text-3xs font-normal leading-3 text-ink-muted">
            <NeedsYouCardIcon label={provider.label} compact>
              <ProviderIcon
                providerId={session.providerId}
                title=""
                className="size-3"
              />
            </NeedsYouCardIcon>
            <Tooltip
              label={session.model || 'Model not recorded'}
              when="truncated"
            >
              <span className="min-w-0 flex-1 truncate">
                {session.model || 'Model not recorded'}
              </span>
            </Tooltip>
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
        )}
        {compact && card.hostLiveness && (
          <time
            className="block text-3xs text-ink-muted"
            dateTime={session.executionHostLastEventAt ?? undefined}
          >
            {card.hostLiveness}
          </time>
        )}
        {compact && card.hostUnreachable && <NeedsYouCardStatus card={card} />}
        {!compact && (
          <div className="mt-1 space-y-1">
            {session.pullRequest && <NeedsYouPr pr={session.pullRequest} />}
            <NeedsYouCardStatus card={card} />
            <span className="block text-3xs font-normal text-ink-muted">
              {card.hostLiveness ? (
                <time dateTime={session.executionHostLastEventAt ?? undefined}>
                  {card.hostLiveness}
                </time>
              ) : (
                <>
                  Last moved{' '}
                  <time dateTime={session.updatedAt} className="tabular-nums">
                    {card.lastMoved}
                  </time>
                </>
              )}
            </span>
          </div>
        )}
      </div>
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
      {footer && <div className="relative z-10 w-full">{footer}</div>}
    </Card>
  )
}
