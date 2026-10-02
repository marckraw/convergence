import type { FC } from 'react'
import { cn, SearchField } from '@convergence/ui'
import type { LoomSearchField } from './loom-stack.types'
import { LOOM_SEARCH_NAME } from './loom-search.pure'
import { LOOM_SEARCH_FIELD_CLASS } from './wave-panel.styles'

/**
 * Loom's search field (MAR-3234). Render-only: the text, the debounce and
 * the Escape order all belong to the container.
 *
 * The kit's SearchField (MC-17): the magnifier, the input, and one clear
 * button that empties it at once and puts the focus back in it -- the same
 * field Mission Control searches its cards with.
 */
export const LoomSearchFieldView: FC<{
  field: LoomSearchField
  className?: string
}> = ({ field, className }) => (
  // Expanded Loom's header is a window-drag strip; this field is not, in
  // either shape (MAR-3284 R1).
  <div
    role="search"
    data-loom-search=""
    className={cn(LOOM_SEARCH_FIELD_CLASS, 'app-no-drag', className)}
  >
    <SearchField
      size="md"
      aria-label={LOOM_SEARCH_NAME}
      placeholder="Issue id or title"
      ref={field.inputRef}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          field.onApply()
        }
      }}
      onClear={field.onClear}
      className="w-full"
    />
  </div>
)
