import type { FC } from 'react'
import {
  formatLocalModelTunnelEndpoint,
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
  <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/50 py-3 last:border-b-0">
    <div className="min-w-0">
      <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <StatusDot state={item.status.state} />
        <span className="truncate">{item.profile.name}</span>
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {formatLocalModelTunnelEndpoint(item)}
      </p>
      {item.status.error ? (
        <p className="mt-1 line-clamp-2 text-xs text-destructive">
          {item.status.error}
        </p>
      ) : null}
    </div>
    <div className="flex items-center gap-1">
      <TunnelActionButtons
        state={item.status.state}
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
