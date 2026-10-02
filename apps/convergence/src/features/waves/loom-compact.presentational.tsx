import type { FC } from 'react'
import { Maximize2 } from 'lucide-react'
import { Button, cn } from '@convergence/ui'
import { LoomStackView } from './loom-stack.presentational'
import { LoomSublineContent } from './loom-crew-picker.presentational'
import { LoomStatusView } from './loom-status.presentational'
import type { LoomStackProps } from './loom-stack.types'
import {
  LOOM_COMPACT_CLASS,
  LOOM_SEARCH_COMPACT_ROW_CLASS,
  LOOM_SEARCH_SUBLINE_ROW_CLASS,
} from './wave-panel.styles'
import { LEARN_LOOM_ENTRY } from './learn-loom-copy.pure'
import { LoomSearchFieldView } from './loom-search.presentational'
import { LoomSearchToggleView } from './loom-search-toggle.presentational'
import { LoomCollapseButton } from './loom-collapse-button.presentational'
import { answerLoomKey } from './loom-keys.pure'

/** One string per control (MAR-3311 R1): Expand's name. */
const EXPAND_LOOM = 'Expand Loom'

export const LoomCompactView: FC<
  LoomStackProps & {
    width: number
    /**
     * What the shell around this column adds while it is arriving
     * (MAR-3312 R3) -- the fade, and nothing else.
     */
    className?: string
    onExpand: () => void
    onCollapse: () => void
  }
> = ({ width, className, onExpand, onCollapse, ...props }) => (
  <aside
    aria-label="Loom"
    data-loom="compact"
    className={cn(LOOM_COMPACT_CLASS, className)}
    style={{ width }}
    // The keys are one rule in both shapes (MC-35). Compact has no Escape of
    // its own: only the container's (a search to clear, a detail to close),
    // and with neither, Escape is not Loom's to answer.
    onKeyDown={(event) =>
      answerLoomKey(event, {
        onShortcut: props.field.onShortcut,
        onEscape: props.onEscape,
      })
    }
  >
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3">
      <h2 className="text-lg font-semibold tracking-tight">Loom</h2>
      <div className="flex shrink-0 items-center gap-1">
        {/* Its words are on it: no tooltip to say them again (MC-15). */}
        <Button
          type="button"
          variant="ghost"
          aria-label={EXPAND_LOOM}
          onClick={onExpand}
          size="md"
        >
          Expand <Maximize2 className="size-3.5" />
        </Button>
        {/* Past Expand, and named apart from it (MAR-3292 R4). Its own
            `no-drag`: the column declares no region of its own, so the
            control says it for itself rather than inheriting whatever is
            above it. */}
        <LoomCollapseButton onCollapse={onCollapse} />
      </div>
    </div>
    <div className="shrink-0 px-3 pb-4 text-xs text-ink-muted">
      <div className={LOOM_SEARCH_SUBLINE_ROW_CLASS}>
        {/* A box, not a paragraph (MAR-3284 R4): with more than one crew
            this holds the crew picker, and a control does not belong inside
            a sentence. Empty of words it still holds its place, so the
            search icon does not walk left when no crew is on screen. */}
        <div data-loom-subline className="min-w-0 flex-1 break-words">
          <LoomSublineContent subline={props.subline} />
        </div>
        <LoomSearchToggleView
          revealed={props.field.revealed}
          onToggle={props.field.onToggleReveal}
        />
      </div>
      <LoomStatusView header={props.header} refresh={props.refresh} />
    </div>
    {/* The search field's own row, under the header, while it is revealed
        or holds a query (MAR-3234 R7). */}
    {props.field.revealed ? (
      <div className={LOOM_SEARCH_COMPACT_ROW_CLASS}>
        <LoomSearchFieldView field={props.field} />
      </div>
    ) : null}
    <LoomStackView {...props} />
    {/* A sibling of the stack, never inside the scrolling sheet body: the
        lesson has to be reachable without scrolling a queue first
        (MAR-3201 R9). */}
    <div data-loom-footer className="flex shrink-0 items-center px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        ref={props.guideRef}
        onClick={props.onOpenGuide}
        size="md"
        className="w-full justify-start"
      >
        {LEARN_LOOM_ENTRY}
      </Button>
    </div>
  </aside>
)
