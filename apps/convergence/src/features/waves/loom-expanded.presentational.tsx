import type { FC } from 'react'
import { Minimize2, PanelLeftClose } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { LoomStackView } from './loom-stack.presentational'
import { LoomSublineContent } from './loom-crew-picker.presentational'
import { LoomStatusView } from './loom-status.presentational'
import type { LoomStackProps } from './loom-stack.types'
import {
  LOOM_COLLAPSE_BUTTON_CLASS,
  LOOM_DRAG_STYLE,
  LOOM_EXPANDED_CLASS,
  LOOM_NO_DRAG_STYLE,
  LOOM_SEARCH_EXPANDED_CLASS,
} from './wave-panel.styles'
import { LEARN_LOOM_ENTRY } from './learn-loom-copy.pure'
import { LoomSearchFieldView } from './loom-search.presentational'
import { isLoomSearchShortcut } from './loom-search.pure'

/**
 * Opaque cover: the transcript underneath retains its measured box.
 *
 * And a cover has to answer the window-drag question for everything it hides
 * (MAR-3284 R1). `no-drag` on the section, because the views underneath
 * declare `drag` strips Electron still honours through the cover; `drag` back
 * on the header row, so Loom's own title strip moves the window like every
 * other title strip in the app; `no-drag` once more on each control in that
 * row, so none of them is a place to pick the window up instead.
 */
export const LoomExpandedView: FC<
  LoomStackProps & { onFold: () => void; onCollapse: () => void }
> = ({ onFold, onCollapse, ...props }) => (
  <section
    aria-label="Loom"
    data-loom="expanded"
    className={LOOM_EXPANDED_CLASS}
    style={LOOM_NO_DRAG_STYLE}
    onKeyDown={(event) => {
      if (isLoomSearchShortcut(event)) {
        event.preventDefault()
        props.field.onShortcut()
        return
      }
      if (event.key === 'Escape') {
        event.stopPropagation()
        ;(props.onEscape ?? onFold)()
      }
    }}
  >
    <div
      data-loom-header
      className="flex shrink-0 items-center gap-4 px-6 py-3"
      style={LOOM_DRAG_STYLE}
    >
      <h2 className="text-lg font-semibold tracking-tight">Loom</h2>
      {/* A box, not a paragraph (MAR-3284 R4): the crew picker lives here.
          It keeps its flex-1 whether or not it has a word to say, so the
          header's spacing does not move with the crew -- and the empty part
          of it is where the window can be picked up. */}
      <div
        data-loom-subline
        className="min-w-0 flex-1 text-xs text-muted-foreground"
      >
        <LoomSublineContent subline={props.subline} />
      </div>
      {/* Between the subline and the guide (MAR-3234 R7). */}
      <LoomSearchFieldView
        field={props.field}
        className={LOOM_SEARCH_EXPANDED_CLASS}
        style={LOOM_NO_DRAG_STYLE}
      />
      {/* Before Fold Loom, so the lesson is reachable without leaving the
          panel it explains (MAR-3201 R9). */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        ref={props.guideRef}
        className="h-10 w-[148px] shrink-0 px-3 text-xs"
        style={LOOM_NO_DRAG_STYLE}
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
        style={LOOM_NO_DRAG_STYLE}
        onClick={onFold}
      >
        <Minimize2 className="size-3.5" />
        Fold Loom
      </Button>
      {/* Past Fold Loom, because it goes one step further (MAR-3292 R4):
          Fold gives the column back, Collapse takes it away. `no-drag` like
          every other control in this header row. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Collapse Loom"
        className={LOOM_COLLAPSE_BUTTON_CLASS}
        style={LOOM_NO_DRAG_STYLE}
        onClick={onCollapse}
      >
        <PanelLeftClose className="size-3.5" />
      </Button>
    </div>
    <div className="shrink-0 px-6 pb-3">
      <LoomStatusView header={props.header} refresh={props.refresh} />
    </div>
    <LoomStackView {...props} wide />
  </section>
)
