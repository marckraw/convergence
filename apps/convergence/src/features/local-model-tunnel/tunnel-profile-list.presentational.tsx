import type { FC } from 'react'
import {
  formatLocalModelTunnelEndpoint,
  type LocalModelTunnelProfileWithStatus,
} from '@/entities/local-model-tunnel'
import { ListRow } from '@convergence/ui'
import { StatusDot } from './status-dot.presentational'

interface TunnelProfileListProps {
  profiles: LocalModelTunnelProfileWithStatus[]
  selectedProfileId: string | null
  onSelect: (profileId: string) => void
}

/**
 * The tunnel profiles down the side of the tunnels dialog: each its state,
 * its name and where it forwards; the chosen one selected (R7).
 */
export const TunnelProfileList: FC<TunnelProfileListProps> = ({
  profiles,
  selectedProfileId,
  onSelect,
}) => (
  <nav
    aria-label="Tunnel profiles"
    className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible"
  >
    {profiles.map((item) => (
      <ListRow
        key={item.profile.id}
        render={
          <button type="button" onClick={() => onSelect(item.profile.id)} />
        }
        selected={item.profile.id === selectedProfileId}
        leading={<StatusDot state={item.status.state} />}
        title={item.profile.name}
        meta={formatLocalModelTunnelEndpoint(item)}
        className="min-w-48 sm:min-w-0"
      />
    ))}
  </nav>
)
