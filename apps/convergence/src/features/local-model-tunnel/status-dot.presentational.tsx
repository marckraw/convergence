import type { FC } from 'react'
import type { LocalModelTunnelState } from '@/entities/local-model-tunnel'
import { StatusDot as ToneDot, type Tone } from '@convergence/ui'

interface StatusDotProps {
  state: LocalModelTunnelState
}

/** What a tunnel's state says (R1): running is done, starting waits, failed failed. */
const TUNNEL_STATE_TONES: Record<LocalModelTunnelState, Tone> = {
  running: 'success',
  external: 'info',
  starting: 'warning',
  failed: 'danger',
  stopped: 'neutral',
}

/** A tunnel's state as the kit's dot; the word beside it says it too. */
export const StatusDot: FC<StatusDotProps> = ({ state }) => (
  <ToneDot tone={TUNNEL_STATE_TONES[state]} />
)
