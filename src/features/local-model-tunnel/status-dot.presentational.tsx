import type { FC } from 'react'
import type { LocalModelTunnelState } from '@/entities/local-model-tunnel'
import { cn } from '@/shared/lib/cn.pure'

interface StatusDotProps {
  state: LocalModelTunnelState
}

export const StatusDot: FC<StatusDotProps> = ({ state }) => (
  <span
    className={cn(
      'inline-block h-2 w-2 shrink-0 rounded-full',
      state === 'running' && 'bg-emerald-500',
      state === 'external' && 'bg-sky-400',
      state === 'starting' && 'bg-warning',
      state === 'failed' && 'bg-destructive',
      state === 'stopped' && 'bg-muted-foreground/70',
    )}
  />
)
