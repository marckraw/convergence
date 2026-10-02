import type { FC } from 'react'
import { Minimize2, PanelLeftClose } from 'lucide-react'
import { Button, cn, IconButton, Tooltip } from '@convergence/ui'
import { LoomStackView } from './loom-stack.presentational'
import { LoomSublineContent } from './loom-crew-picker.presentational'
import { LoomStatusView } from './loom-status.presentational'
import type { LoomStackProps } from './loom-stack.types'
import {
  LOOM_COLLAPSE_BUTTON_CLASS,
  LOOM_EXPANDED_CLASS,
  LOOM_GUIDE_ENTRY_CLASS,
  LOOM_SEARCH_EXPANDED_CLASS,
} from './wave-panel.styles'
import { LEARN_LOOM_ENTRY } from './learn-loom-copy.pure'
import { LoomSearchFieldView } from './loom-search.presentational'
import { isLoomSearchShortcut } from './loom-search.pure'

/**
 * One string per control, the label and the hint alike (MAR-3311 R1).
 */
const FOLD_LOOM = 'Fold Loom'
const COLLAPSE_LOOM = 'Collapse Loom'

/**
 * Opaque cover: the transcript underneath retains its measured box.
 *
 * And a cover has to answer the window-drag question for everything it hides
 * (MAR-3284 R1). `app-no-drag` on the section, because the views underneath
 * declare `drag` strips Electron still honours through the cover; `app-drag`
 * back on the header row, so Loom's own title strip moves the window like
 * every other title strip in the app; and each control in that row is
 * `app-no-drag` once more, as every Button, IconButton and field of the
 * design system is by itself, so none of them is a place to pick the window
 * up instead.
 */
export const LoomExpandedView: FC<
  LoomStackProps & { onFold: () => void; onCollapse: () => void }
> = ({ onFold, onCollapse, ...props }) => (
  <section
    aria-label="Loom"
    data-loom="expanded"
    className={cn(LOOM_EXPANDED_CLASS, 'app-no-drag')}
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
      className="app-drag flex shrink-0 items-center gap-4 px-6 py-3"
    >
      <h2 className="text-lg font-semibold tracking-tight">Loom</h2>
      {/* A box, not a paragraph (MAR-3284 R4): the crew picker lives here.
          It keeps its flex-1 whether or not it has a word to say, so the
          header's spacing does not move with the crew -- and the empty part
          of it is where the window can be picked up. */}
      <div data-loom-subline className="min-w-0 flex-1 text-xs text-ink-muted">
        <LoomSublineContent subline={props.subline} />
      </div>
      {/* Between the subline and the guide (MAR-3234 R7). */}
      <LoomSearchFieldView
        field={props.field}
        className={LOOM_SEARCH_EXPANDED_CLASS}
      />
      {/* Before Fold Loom, so the lesson is reachable without leaving the
          panel it explains (MAR-3201 R9). */}
      <Button
        type="button"
        variant="ghost"
        ref={props.guideRef}
        onClick={props.onOpenGuide}
        size="lg"
        className={LOOM_GUIDE_ENTRY_CLASS}
      >
        {LEARN_LOOM_ENTRY}
      </Button>
      <Tooltip label={FOLD_LOOM} side="bottom">
        <Button
          type="button"
          variant="ghost"
          aria-label={FOLD_LOOM}
          onClick={onFold}
          size="lg"
          className="shrink-0 px-3 text-xs py-0"
        >
          <Minimize2 className="size-3.5" />
          {FOLD_LOOM}
        </Button>
      </Tooltip>
      {/* Past Fold Loom, because it goes one step further (MAR-3292 R4):
          Fold gives the column back, Collapse takes it away. `app-no-drag`,
          its own, like every other control in this header row. */}

      <IconButton
        label={COLLAPSE_LOOM}
        type="button"
        variant="ghost"
        onClick={onCollapse}
        tooltipSide="bottom"
        size="sm"
        className={LOOM_COLLAPSE_BUTTON_CLASS}
      >
        <PanelLeftClose className="size-3.5" />
      </IconButton>
    </div>
    <div className="shrink-0 px-6 pb-3">
      <LoomStatusView header={props.header} refresh={props.refresh} />
    </div>
    <LoomStackView {...props} wide />
  </section>
)
