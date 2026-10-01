import { SearchIcon, XIcon } from 'lucide-react'
import { useRef, type ReactNode, type Ref } from 'react'
import { cn } from '#lib/cn.pure'
import {
  controlFrame,
  controlHeight,
  type ControlSize,
} from '#lib/control-frame.styles'
import { focusRingWithin } from '#lib/focus-ring.styles'
import { IconButton } from '../icon-button/icon-button'
import { Input, type InputProps } from '../input/input'

export type SearchFieldProps = Omit<
  InputProps,
  'type' | 'className' | 'size'
> & {
  /** On the field's box: its width, or its place in a bar (`flex-1`). */
  className?: string
  /** R3: 24, 28, 32 or 36 px. `md` (32) unless said. */
  size?: ControlSize
  /**
   * A word at the field's end about what's under way: "Searching…". Pass it
   * once the work has taken 300 ms (useDelayedLoading), so a quick answer
   * never flashes it.
   */
  trailing?: ReactNode
  /**
   * Shows a clear button while there's something to clear; pressing it calls
   * this and puts the focus back in the field. The browser's own clear
   * button is hidden, so there's only ever one.
   */
  onClear?: () => void
  /** The clear button's name. */
  clearLabel?: string
}

/** The input inside: the box draws its look, so it's bare, as tall as the box. */
const bareInput = [
  'h-auto min-h-0 self-stretch rounded-none border-0 bg-transparent px-0 py-0 shadow-none',
  'focus-visible:outline-none data-disabled:opacity-100',
  '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
].join(' ')

/**
 * A field to search or filter with (MAR-3616 DS3c): a magnifier, the Input
 * (type="search"), a word at its end if work is under way, and one clear
 * button. It looks, rings and sizes like an Input. Name it with an
 * aria-label, or put it in a Field with a FieldLabel. Every Input prop goes
 * to the input: its value, onChange, placeholder, and a combobox's role when
 * it drives a list.
 */
export function SearchField({
  className,
  size = 'md',
  trailing,
  onClear,
  clearLabel = 'Clear search',
  value,
  ref,
  ...props
}: SearchFieldProps) {
  const ownRef = useRef<HTMLInputElement | null>(null)
  const setRef = (node: HTMLInputElement | null) => {
    ownRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as { current: HTMLInputElement | null }).current = node
  }
  const canClear =
    onClear !== undefined &&
    value !== undefined &&
    value !== null &&
    String(value) !== ''
  return (
    <div
      data-slot="search-field"
      data-size={size}
      className={cn(
        'flex items-center gap-2 px-3',
        controlFrame,
        controlHeight[size],
        focusRingWithin,
        'has-focus-visible:-outline-offset-1',
        'has-aria-invalid:border-danger-solid has-data-disabled:opacity-50',
        className,
      )}
    >
      <SearchIcon aria-hidden className="size-4 shrink-0 text-ink-muted" />
      <Input
        type="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={value}
        ref={setRef as Ref<HTMLInputElement>}
        {...props}
        className={bareInput}
      />
      {trailing ? (
        <span
          data-slot="search-field-trailing"
          className="shrink-0 whitespace-nowrap text-xs text-ink-muted transition-opacity starting:opacity-0"
        >
          {trailing}
        </span>
      ) : null}
      {canClear ? (
        <IconButton
          data-slot="search-field-clear"
          label={clearLabel}
          size="xs"
          onClick={() => {
            onClear()
            ownRef.current?.focus()
          }}
          // Its edge near the box's, and no taller than the box's row.
          className="-my-1 -mr-2 shrink-0 text-ink-muted"
        >
          <XIcon aria-hidden className="size-3.5" />
        </IconButton>
      ) : null}
    </div>
  )
}
