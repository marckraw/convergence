import type { FC } from 'react'
import type {
  LocalModelTunnelConnectionKind,
  LocalModelTunnelState,
} from '@/entities/local-model-tunnel'
import { Button } from '@/shared/ui/button'
import { Play, RefreshCw, RotateCcw, Square } from 'lucide-react'

interface TunnelActionButtonsProps {
  state: LocalModelTunnelState
  connectionKind: LocalModelTunnelConnectionKind
  managed: boolean
  isMutating: boolean
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onManage: () => void
}

export const TunnelActionButtons: FC<TunnelActionButtonsProps> = ({
  state,
  connectionKind,
  managed,
  isMutating,
  onStart,
  onStop,
  onRestart,
  onManage,
}) => {
  if (connectionKind === 'local-runtime') {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isMutating}
        onClick={onStart}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
    )
  }

  if (state === 'running' && managed) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isMutating}
          onClick={onRestart}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Restart
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isMutating}
          onClick={onStop}
        >
          <Square className="h-3.5 w-3.5" />
          Stop
        </Button>
      </>
    )
  }

  if (state === 'starting') {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isMutating}
        onClick={onStop}
      >
        <Square className="h-3.5 w-3.5" />
        Cancel
      </Button>
    )
  }

  if (state === 'failed') {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isMutating}
        onClick={onStart}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Retry
      </Button>
    )
  }

  if (state === 'external') {
    return (
      <Button type="button" variant="outline" size="sm" onClick={onManage}>
        Manage
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isMutating}
      onClick={onStart}
    >
      <Play className="h-3.5 w-3.5" />
      Start
    </Button>
  )
}
