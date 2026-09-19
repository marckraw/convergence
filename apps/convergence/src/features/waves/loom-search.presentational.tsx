import type { FC } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import type { LoomSearchField } from './loom-stack.types'
import { LOOM_SEARCH_NAME } from './loom-search.pure'
import {
  LOOM_SEARCH_CLEAR_CLASS,
  LOOM_SEARCH_FIELD_CLASS,
  LOOM_SEARCH_GLYPH_CLASS,
  LOOM_SEARCH_ICON_CLASS,
  LOOM_SEARCH_INPUT_CLASS,
} from './wave-panel.styles'

/**
 * Loom's search field (MAR-3234). Render-only: the text, the debounce and
 * the Escape order all belong to the container.
 *
 * The look is provisional -- no design brief exists for it -- and every class
 * is in the styles file so the Design Director can restyle it in one place.
 */
export const LoomSearchFieldView: FC<{
  field: LoomSearchField
  className?: string
}> = ({ field, className }) => (
  <div
    role="search"
    data-loom-search=""
    className={cn(LOOM_SEARCH_FIELD_CLASS, className)}
  >
    <Search aria-hidden="true" className={LOOM_SEARCH_ICON_CLASS} />
    <Input
      type="search"
      aria-label={LOOM_SEARCH_NAME}
      placeholder="Issue id or title"
      autoComplete="off"
      spellCheck={false}
      ref={field.inputRef}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          field.onApply()
        }
      }}
      className={LOOM_SEARCH_INPUT_CLASS}
    />
    {field.value !== '' ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Clear search"
        className={LOOM_SEARCH_CLEAR_CLASS}
        onClick={field.onClear}
      >
        <X aria-hidden="true" className={LOOM_SEARCH_GLYPH_CLASS} />
      </Button>
    ) : null}
  </div>
)
