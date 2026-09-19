import type { FC } from 'react'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { LoomStackView } from './loom-stack.presentational'
import { LoomStatusView } from './loom-status.presentational'
import type { LoomStackProps } from './loom-stack.types'
import { LOOM_COMPACT_CLASS } from './wave-panel.styles'

export const LoomCompactView: FC<
  LoomStackProps & { width: number; onExpand: () => void }
> = ({ width, onExpand, ...props }) => (
  <aside
    aria-label="Loom"
    data-loom="compact"
    className={LOOM_COMPACT_CLASS}
    style={{ width }}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && props.onEscape) {
        event.stopPropagation()
        props.onEscape()
      }
    }}
  >
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3">
      <h2 className="text-lg font-semibold tracking-tight">Loom</h2>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Expand Loom"
        className="h-10 gap-2 px-2 text-xs"
        onClick={onExpand}
      >
        Expand <Maximize2 className="size-3.5" />
      </Button>
    </div>
    <div className="shrink-0 px-3 pb-4 text-xs text-muted-foreground">
      <p className="mb-2 break-words">{props.subline}</p>
      <LoomStatusView header={props.header} />
    </div>
    <LoomStackView {...props} />
  </aside>
)
