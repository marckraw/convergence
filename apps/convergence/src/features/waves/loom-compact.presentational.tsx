import type { FC } from 'react'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
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
import { isLoomSearchShortcut } from './loom-search.pure'

export const LoomCompactView: FC<
  LoomStackProps & { width: number; onExpand: () => void }
> = ({ width, onExpand, ...props }) => (
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
