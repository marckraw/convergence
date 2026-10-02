import type { FC } from 'react'
import {
  formatLocalModelTunnelConnectionLabel,
  formatLocalModelTunnelEndpoint,
  formatLocalModelTunnelStatusDetail,
  type LocalModelTunnelProfileWithStatus,
} from '@/entities/local-model-tunnel'
import { StatusDot } from './status-dot.presentational'
import { TunnelActionButtons } from './tunnel-action-buttons.presentational'

interface TunnelPopoverRowProps {
  item: LocalModelTunnelProfileWithStatus
  isMutating: boolean
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onManage: () => void
}

export const TunnelPopoverRow: FC<TunnelPopoverRowProps> = ({
  item,
  isMutating,
  onStart,
  onStop,
  onRestart,
  onManage,
}) => (
  <div className="flex gap-3 border-b border-line-soft py-3 last:border-b-0">
    <div className="min-w-0 flex-1">
      <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <StatusDot state={item.status.state} />
        <span className="truncate">{item.profile.name}</span>
      </p>
      <p className="mt-1 truncate text-xs text-ink-muted">
        {formatLocalModelTunnelEndpoint(item)}
      </p>
      <p className="mt-0.5 truncate text-2xs text-ink-muted">
        {formatLocalModelTunnelConnectionLabel(item)} ·{' '}
        {formatLocalModelTunnelStatusDetail(item)}
      </p>
      {item.status.error ? (
        <p className="mt-1 line-clamp-2 text-xs text-danger-ink">
          {item.status.error}
        </p>
      ) : null}
    </div>
    <div className="flex shrink-0 items-center gap-1">
      <TunnelActionButtons
        state={item.status.state}
        connectionKind={item.profile.connectionKind}
        managed={item.status.managed}
        isMutating={isMutating}
        onStart={onStart}
        onStop={onStop}
        onRestart={onRestart}
        onManage={onManage}
      />
    </div>
  </div>
)
