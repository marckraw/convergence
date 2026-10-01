import {
  type ComponentProps,
  createContext,
  type ReactNode,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react'
import { cn } from '#lib/cn.pure'
import { listboxOptionId } from './listbox.pure'

type ListboxContextValue = {
  id: string
  active: number | null
  multiline: boolean
}

const ListboxContext = createContext<ListboxContextValue | null>(null)

type ListboxProps = Omit<
  ComponentProps<'div'>,
  'id' | 'role' | 'className' | 'aria-label'
> & {
  /** Its id: the field names it (aria-controls), and each row's id is made from it. */
  id: string
  /** What it lists, for a screen reader: "Commands", "Models", "Skills". */
  'aria-label': string
  /** The keyboard's row, from 0, which the field names (aria-activedescendant); null for none. */
  active: number | null
  /**
   * Its rows hold more than a line (a name over its description): each is as
   * tall as its content, stacked. A one-line row sits its parts side by side.
   */
  multiline?: boolean
  className?: string
}

/**
 * The list a field drives as you type (MAR-3616 DS3e), like the command
 * palette's, the model picker's and the composer's `@` and `::` pickers: the
 * focus stays in the field, whose arrow keys move the active row
 * (aria-activedescendant, named with `listboxOptionId(id, index)`; the field
 * gets the steps from `listboxStep`) and whose Enter picks it. The field is a
 * SearchField or an Input with role="combobox", aria-controls, aria-expanded
 * and aria-autocomplete="list", or the composer's textarea with
 * aria-controls and aria-activedescendant.
 *
 * Its children are ListboxOptions, or ListboxGroups of them, and nothing
 * else: a heading, a hint or a close button sits outside it. Name it
 * (aria-label). With nothing to list, show an EmptyState instead, since a
 * listbox with no options is a broken one. A long list scrolls itself (a
 * max height on the Listbox, not on a wrapper): as the list a combobox
 * controls, it needs no tab stop of its own. The active row takes today's
 * highlight and jumps to it (R0); the row scrolls itself into view.
 */
function Listbox({
  id,
  active,
  multiline = false,
  className,
  children,
  ...props
}: ListboxProps) {
  const context = useMemo(
    () => ({ id, active, multiline }),
    [id, active, multiline],
  )
  return (
    <div
      {...props}
      id={id}
      role="listbox"
      data-slot="listbox"
      className={cn('outline-none', className)}
    >
      <ListboxContext value={context}>{children}</ListboxContext>
    </div>
  )
}

type ListboxGroupProps = Omit<
  ComponentProps<'div'>,
  'role' | 'className' | 'children'
> & {
  /** Its heading: shown above its rows, and the group's accessible name. */
  label: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Rows under a heading, like the palette's "Waiting on you" and "Projects".
 * The heading names the group, so a screen reader says where the active row
 * sits. Its rows keep counting from the rows before it.
 */
function ListboxGroup({
  label,
  className,
  children,
  ...props
}: ListboxGroupProps) {
  const headingId = useId()
  return (
    <div
      {...props}
      role="group"
      aria-labelledby={headingId}
      data-slot="listbox-group"
      className={cn('not-first:mt-1', className)}
    >
      <div
        id={headingId}
        data-slot="listbox-group-label"
        className="px-2 pt-2 pb-1 text-2xs font-medium text-ink-muted"
      >
        {label}
      </div>
      {children}
    </div>
  )
}

type ListboxOptionProps = Omit<
  ComponentProps<'div'>,
  | 'id'
  | 'role'
  | 'className'
  | 'children'
  | 'tabIndex'
  | 'onClick'
  | 'onPointerDown'
  | 'onPointerMove'
> & {
  /** Its place in the whole list, from 0: its id, and whether it's the active row. */
  index: number
  /** Picked, by a click (the field's Enter is the field's). Not called while disabled. */
  onPick: () => void
  /**
   * A moving pointer is on it: make it the active row, so the keyboard carries
   * on from there. Only a moving pointer counts, so rows that arrive under a
   * resting one don't take the keyboard's place.
   */
  onHover?: () => void
  /** Listed, but not choosable now: dimmed, announced so, and a click does nothing. */
  disabled?: boolean
  className?: string
  /**
   * Its content: on one line, a name cut short when it's long (`truncate`);
   * in a `multiline` Listbox, its lines, stacked.
   */
  children: ReactNode
}

/** A press keeps the focus in the field, so the arrows go on working the list after a click. */
const keepFocus = (event: { preventDefault: () => void }) =>
  event.preventDefault()

/**
 * One row of a Listbox: an option, aria-selected while it's the active row
 * (the choice follows the keyboard, as in a picker), that never takes the
 * focus. A click picks it. It scrolls itself into view when it becomes the
 * active row, so the arrows never leave it out of sight.
 */
function ListboxOption({
  index,
  onPick,
  onHover,
  disabled = false,
  className,
  children,
  ...props
}: ListboxOptionProps) {
  const list = use(ListboxContext)
  if (list === null) throw new Error('A ListboxOption goes inside a Listbox.')
  const active = list.active === index
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <div
      {...props}
      ref={ref}
      id={listboxOptionId(list.id, index)}
      role="option"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      data-slot="listbox-option"
      data-active={active || undefined}
      className={cn(
        'flex min-w-0 cursor-default select-none rounded-md px-2 py-1.5 text-sm outline-none',
        list.multiline
          ? 'flex-col items-stretch gap-0.5'
          : 'items-center gap-2',
        'aria-selected:bg-highlight aria-selected:text-on-highlight',
        'aria-disabled:opacity-50',
        className,
      )}
      onClick={() => {
        if (!disabled) onPick()
      }}
      onPointerDown={keepFocus}
      onPointerMove={active ? undefined : onHover}
    >
      {children}
    </div>
  )
}

export {
  Listbox,
  ListboxGroup,
  type ListboxGroupProps,
  ListboxOption,
  type ListboxOptionProps,
  type ListboxProps,
}
