import type { FC } from 'react'
import { Maximize2, PanelLeftClose } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { LoomStackView } from './loom-stack.presentational'
import { LoomSublineContent } from './loom-crew-picker.presentational'
import { LoomStatusView } from './loom-status.presentational'
import type { LoomStackProps } from './loom-stack.types'
import {
  LOOM_COLLAPSE_BUTTON_CLASS,
  LOOM_COMPACT_CLASS,
  LOOM_NO_DRAG_STYLE,
  LOOM_SEARCH_COMPACT_ROW_CLASS,
  LOOM_SEARCH_SUBLINE_ROW_CLASS,
} from './wave-panel.styles'
import { LEARN_LOOM_ENTRY } from './learn-loom-copy.pure'
import { LoomSearchFieldView } from './loom-search.presentational'
import { LoomSearchToggleView } from './loom-search-toggle.presentational'
import { isLoomSearchShortcut } from './loom-search.pure'

/**
 * One string per control, the label and the hint alike (MAR-3311 R1).
 */
const EXPAND_LOOM = 'Expand Loom'
const COLLAPSE_LOOM = 'Collapse Loom'

export const LoomCompactView: FC<
  LoomStackProps & {
    width: number
    onExpand: () => void
    onCollapse: () => void
  }
> = ({ width, onExpand, onCollapse, ...props }) => (
  <aside
    aria-label="Loom"
    data-loom="compact"
    className={LOOM_COMPACT_CLASS}
    style={{ width }}
    onKeyDown={(event) => {
      if (isLoomSearchShortcut(event)) {
        event.preventDefault()
        props.field.onShortcut()
        return
      }
      if (event.key === 'Escape' && props.onEscape) {
        event.stopPropagation()
        props.onEscape()
      }
    }}
  >
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3">
      <h2 className="text-lg font-semibold tracking-tight">Loom</h2>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={EXPAND_LOOM}
              className="h-10 gap-2 px-2 text-xs"
              onClick={onExpand}
            >
              Expand <Maximize2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" style={LOOM_NO_DRAG_STYLE}>
            {EXPAND_LOOM}
          </TooltipContent>
        </Tooltip>
        {/* Icon-only, and named apart from the two controls that were
            already here (MAR-3292 R4): "Expand Loom" goes wider, "Fold
            Loom" in the expanded header comes back to this column, and
            "Collapse Loom" takes the column away altogether. `no-drag`
            because a control inside a drag strip is not a control -- the
            column declares no region of its own, so this says it for
            itself rather than inheriting whatever is above it. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={COLLAPSE_LOOM}
              className={LOOM_COLLAPSE_BUTTON_CLASS}
              style={LOOM_NO_DRAG_STYLE}
              onClick={onCollapse}
            >
              <PanelLeftClose className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" style={LOOM_NO_DRAG_STYLE}>
            {COLLAPSE_LOOM}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
    <div className="shrink-0 px-3 pb-4 text-xs text-muted-foreground">
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
        size="sm"
        ref={props.guideRef}
        className="h-10 w-full justify-start px-2 text-xs"
        onClick={props.onOpenGuide}
      >
        {LEARN_LOOM_ENTRY}
      </Button>
    </div>
  </aside>
)
