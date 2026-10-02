import type { FC } from 'react'
import { Minimize2 } from 'lucide-react'
import { Button, cn } from '@convergence/ui'
import { LoomStackView } from './loom-stack.presentational'
import { LoomSublineContent } from './loom-crew-picker.presentational'
import { LoomStatusView } from './loom-status.presentational'
import type { LoomStackProps } from './loom-stack.types'
import {
  LOOM_EXPANDED_CLASS,
  LOOM_GUIDE_ENTRY_CLASS,
  LOOM_SEARCH_EXPANDED_CLASS,
} from './wave-panel.styles'
import { LEARN_LOOM_ENTRY } from './learn-loom-copy.pure'
import { LoomSearchFieldView } from './loom-search.presentational'
import { LoomCollapseButton } from './loom-collapse-button.presentational'
import { answerLoomKey } from './loom-keys.pure'

/** One string per control (MAR-3311 R1): Fold's words. */
const FOLD_LOOM = 'Fold Loom'

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
    // The keys are one rule in both shapes (MC-35). Expanded always answers
    // Escape: the container's when it has one (a search to clear, a detail
    // to close), and Fold when it has none.
    onKeyDown={(event) =>
      answerLoomKey(event, {
        onShortcut: props.field.onShortcut,
        onEscape: props.onEscape ?? onFold,
      })
    }
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
        size="md"
        className={LOOM_GUIDE_ENTRY_CLASS}
      >
        {LEARN_LOOM_ENTRY}
      </Button>
      {/* Its words are on it: no tooltip to say them again (MC-15). */}
      <Button
        type="button"
        variant="ghost"
        onClick={onFold}
        size="md"
        className="shrink-0"
      >
        <Minimize2 className="size-3.5" />
        {FOLD_LOOM}
      </Button>
      {/* Past Fold Loom, because it goes one step further (MAR-3292 R4):
          Fold gives the column back, Collapse takes it away. `app-no-drag`,
          its own, like every other control in this header row. */}
      <LoomCollapseButton onCollapse={onCollapse} />
    </div>
    <div className="shrink-0 px-6 pb-3">
      <LoomStatusView header={props.header} refresh={props.refresh} />
    </div>
    <LoomStackView {...props} wide />
  </section>
)
