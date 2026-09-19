import type { FC } from 'react'
import { Minimize2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { LoomStackView } from './loom-stack.presentational'
import { LoomSublineContent } from './loom-crew-picker.presentational'
import { LoomStatusView } from './loom-status.presentational'
import type { LoomStackProps } from './loom-stack.types'
import { LOOM_EXPANDED_CLASS } from './wave-panel.styles'
import { LEARN_LOOM_ENTRY } from './learn-loom-copy.pure'

/** Opaque cover: the transcript underneath retains its measured box. */
export const LoomExpandedView: FC<LoomStackProps & { onFold: () => void }> = ({
  onFold,
  ...props
}) => (
  <section
    aria-label="Loom"
    data-loom="expanded"
    className={LOOM_EXPANDED_CLASS}
    onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        ;(props.onEscape ?? onFold)()
      }
    }}
  >
    <div className="flex shrink-0 items-center gap-4 px-6 py-3">
      <h2 className="text-lg font-semibold tracking-tight">Loom</h2>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        <LoomSublineContent subline={props.subline} />
      </p>
      {/* Before Fold Loom, so the lesson is reachable without leaving the
          panel it explains (MAR-3201 R9). */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        ref={props.guideRef}
        className="h-10 w-[148px] shrink-0 px-3 text-xs"
        onClick={props.onOpenGuide}
      >
        {LEARN_LOOM_ENTRY}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Fold Loom"
        className="h-10 shrink-0 gap-2 px-3 text-xs"
        onClick={onFold}
      >
        <Minimize2 className="size-3.5" />
        Fold Loom
      </Button>
    </div>
    <div className="shrink-0 px-6 pb-3">
      <LoomStatusView header={props.header} refresh={props.refresh} />
    </div>
    <LoomStackView {...props} wide />
  </section>
)
