import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { Field as FieldPrimitive } from '@base-ui/react/field'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '#lib/cn.pure'
import {
  type ControlSize,
  fieldTrigger,
  fieldTriggerSize,
} from '#lib/control-frame.styles'
import { popupMotion } from '../../motion/popup.styles'
import { Badge } from '../badge/badge'
import { Button, type ButtonVariant } from '../button/button'
import { EmptyState } from '../empty-state/empty-state'
import { SearchField } from '../search-field/search-field'
import { Tooltip } from '../tooltip/tooltip'
import {
  comboboxFooter,
  comboboxGroupLabel,
  comboboxItem,
  comboboxList,
  comboboxNameRow,
  comboboxPopup,
  comboboxPositioner,
  comboboxSearch,
} from './combobox.styles'
import { filterComboboxItems, groupComboboxItems } from './combobox.pure'

/** One choice in a Combobox's list. */
type ComboboxItem = {
  id: string
  /** Its name: what the row says first and what the search matches. */
  label: string
  /** A second, muted line. A disabled item's description is why, and wraps. */
  description?: string
  /** A small picture before the label (16 px or less), decorative. */
  icon?: ReactNode
  /** A word on a warning tint after the label (an ALPHA provider); it is searched too. */
  badge?: {
    label: string
    /** More about it, in our tooltip for a pointer that rests on it (R2). */
    title?: string
  }
  /**
   * Nesting level, for an item that belongs under the one before it -- a lane
   * under its root project (MAR-2783). 0 or absent is top level.
   */
  depth?: number
  /**
   * Listed but not choosable. For options that exist and matter to the user —
   * a provider account attestation disabled, say — where hiding them would be
   * more confusing than showing why they cannot be picked.
   */
  disabled?: boolean
  /** The heading it sits under. Items that share one are listed together, in order. */
  group?: string
  /** A muted word or number at the row's end, such as how many it holds. */
  trailing?: ReactNode
}

/** One more thing to do from the list, below it: "Open a project", "Manage accounts…". */
type ComboboxAction = {
  label: string
  icon?: ReactNode
  onSelect: () => void
}

type ComboboxSharedProps = {
  /** What the trigger says: the chosen item's words, or a placeholder. */
  value: string
  items: readonly ComboboxItem[]
  disabled?: boolean
  /** The search field's placeholder and its accessible name. */
  searchPlaceholder?: string
  /**
   * Said when nothing is listed: when nothing matches the search, or there is
   * nothing at all. A function hears the search, to say what didn't match.
   */
  emptyMessage?: ReactNode | ((query: string) => ReactNode)
  /** The list is on its way: a spinner and these words stand in for it. */
  loadingMessage?: string
  /** It couldn't load: an alert says why, with Try again if `onRetry` is given. */
  error?: string | null
  onRetry?: () => void
  /**
   * The trigger's look: a Button's, for a toolbar or a chip (`secondary`
   * unless told otherwise), or `field`, the field frame SelectTrigger and
   * Input wear, for a form where it sits beside them (DLG-15).
   */
  variant?: ButtonVariant | 'field'
  /** R3: the trigger's height, 24, 28, 32 or 36 px; `md` (32) unless told otherwise. */
  size?: ControlSize
  /** On the trigger: its width, or its place in a row. Never its height (R3). */
  className?: string
  /** On the popup: its width when it should differ from the trigger's. */
  contentClassName?: string
  /** Before the trigger's words; the chosen item's icon unless given. */
  icon?: ReactNode
  /** Whether the trigger ends in a chevron. A chip-like trigger may leave it out. */
  chevron?: boolean
  /**
   * The trigger's accessible name; defaults to its visible value. In a Field
   * it needs none: the Field's label names it and its description describes
   * it, and the popup takes the same name.
   */
  ariaLabel?: string
  /** One more thing to do, as a row under the list. */
  action?: ComboboxAction
  /** Anything else under the list, such as a form to make a new item. */
  footer?: ReactNode
  /** Whether the list has a search field. Turn it off for a list short enough to scan. */
  searchable?: boolean
  /**
   * Whether an item matches the search, for a list with a matching rule of
   * its own. By default an item matches when its label, description or
   * badge holds the query, ignoring case.
   */
  filter?: (item: ComboboxItem, query: string) => boolean
  /**
   * Controlled open state, for a caller that must open the list from outside
   * its trigger (MAR-3393: the Actions menu's "Hand off"). Absent, the
   * combobox owns its open state. A disabled combobox never opens.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type ComboboxSingleProps = ComboboxSharedProps & {
  multiple?: false
  /** The chosen item's id, or null for none. */
  selectedId: string | null
  /** Picked: the list closes and the focus goes back to the trigger. */
  onChange: (id: string) => void
}

type ComboboxMultipleProps = ComboboxSharedProps & {
  /** Several can be chosen: picking ticks or unticks, and the list stays open. */
  multiple: true
  selectedIds: readonly string[]
  /** Every chosen id, after a pick ticked or unticked one. */
  onChange: (ids: string[]) => void
}

type ComboboxProps = ComboboxSingleProps | ComboboxMultipleProps

/** The trigger's chevron and icon size, by its size. */
const CHEVRON = 'size-3 shrink-0 text-ink-muted'
/** The field look's chevron: SelectTrigger's. */
const FIELD_CHEVRON = 'size-4 shrink-0 text-ink-muted'

/**
 * A Radix dialog (until every dialog is on Base UI) holds the focus and the
 * pointer inside its own DOM: a list in the body would lose its focus to the
 * dialog's trap and close the dialog on a click. Inside one, the list renders
 * into the dialog, where Floating UI fits it to the room the dialog has.
 */
const RADIX_DIALOG = '[data-slot="dialog-content"][data-state]'

/**
 * While the list is open inside a Radix dialog, Escape is the list's: the
 * dialog hears it first (a capture listener on the document) and would close
 * too. Marked handled before it gets there (on the window, earlier in the
 * capture), the dialog lets it pass and the list closes as it should.
 */
function useEscapeStaysInList(active: boolean) {
  useEffect(() => {
    if (!active) return
    const claim = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault()
    }
    window.addEventListener('keydown', claim, true)
    return () => window.removeEventListener('keydown', claim, true)
  }, [active])
}

/**
 * One choice from a long or loaded list, with a search (MAR-3616 DS3e, R9):
 * branches, models, projects, hosts. Up to about eight fixed options is a
 * Select; this is for the rest. It replaces SearchableSelect and keeps its
 * props, on Base UI's Combobox.
 *
 * The trigger is a Button (`variant`, R3 `size`), or the field frame
 * (`variant="field"`), with `role="combobox"`, named by its value (or
 * `ariaLabel`), or by its Field's label when it sits in one: the search in
 * the popup keeps its own name. It opens a popup on the one raised
 * surface (R8) as wide as the trigger, holding a SearchField that keeps the
 * focus while the arrow keys move the highlight (aria-activedescendant), Enter
 * picks and Escape closes, putting the focus back on the trigger. The list
 * can be grouped; when it is empty, loading or failed, an EmptyState says
 * so in its place, never an empty listbox. `multiple` ticks several and stays
 * open.
 */
function Combobox(props: ComboboxProps) {
  const {
    value,
    items,
    disabled = false,
    searchPlaceholder = 'Search options...',
    emptyMessage = 'No options found.',
    loadingMessage,
    error,
    onRetry,
    variant = 'secondary',
    size = 'md',
    className,
    contentClassName,
    icon,
    chevron = true,
    ariaLabel,
    action,
    footer,
    searchable = true,
    filter,
    open: controlledOpen,
    onOpenChange,
  } = props
  const listId = useId()
  const statusId = useId()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [trigger, setTrigger] = useState<HTMLElement | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const isDisabled =
    disabled || (items.length === 0 && !action && footer === undefined)
  const open =
    controlledOpen === undefined
      ? uncontrolledOpen && !isDisabled
      : controlledOpen && !isDisabled
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
    if (!next) setQuery('')
  }

  const selectedIds: readonly string[] = props.multiple
    ? props.selectedIds
    : props.selectedId === null
      ? []
      : [props.selectedId]
  const chosen = items.find((item) => item.id === selectedIds[0])
  const triggerIcon = icon ?? (props.multiple ? undefined : chosen?.icon)
  const name = ariaLabel ?? value
  const visible = filter
    ? items.filter((item) => filter(item, query))
    : filterComboboxItems(items, query)
  const listShown = loadingMessage === undefined && !error && visible.length > 0
  const container = trigger?.closest<HTMLElement>(RADIX_DIALOG) ?? undefined
  useEscapeStaysInList(open && container !== undefined)
  const message =
    typeof emptyMessage === 'function' ? emptyMessage(query) : emptyMessage
  // In a Field, Base UI names the trigger by the Field's label; the popup and
  // its list take that name too, so they are announced as the field.
  const fieldLabelId = trigger?.getAttribute('aria-labelledby') ?? undefined
  const naming = fieldLabelId
    ? { 'aria-labelledby': fieldLabelId }
    : { 'aria-label': name }

  const renderItem = (item: ComboboxItem) => {
    const picked = selectedIds.includes(item.id)
    return (
      <ComboboxPrimitive.Item
        key={item.id}
        value={item.id}
        disabled={item.disabled}
        data-depth={item.depth ?? 0}
        style={
          item.depth
            ? { paddingLeft: `${0.5 + item.depth * 1.25}rem` }
            : undefined
        }
        className={comboboxItem}
      >
        {props.multiple ? (
          <CheckIcon
            aria-hidden
            className={cn(
              'mt-0.5 size-3.5 shrink-0',
              picked ? 'opacity-100' : 'opacity-0',
            )}
          />
        ) : null}
        {item.icon}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={comboboxNameRow}>
            <span className="truncate font-medium">{item.label}</span>
            {item.badge ? (
              <Tooltip label={item.badge.title}>
                <Badge tone="warning" shape="label">
                  {item.badge.label}
                </Badge>
              </Tooltip>
            ) : null}
          </span>
          {item.description ? (
            <span
              className={cn(
                'text-2xs text-ink-muted group-data-highlighted:text-inherit',
                // A disabled row's description is the reason it cannot be
                // picked, and this popup has no tooltip: truncated, that
                // reason is a mystery no hover solves. It wraps. Every other
                // description is supplementary and keeps the single line.
                item.disabled ? 'whitespace-normal' : 'truncate',
              )}
            >
              {item.description}
            </span>
          ) : null}
        </div>
        {item.trailing !== undefined ? (
          <span className="shrink-0 tabular-nums text-ink-muted">
            {item.trailing}
          </span>
        ) : null}
        {!props.multiple && picked ? (
          <CheckIcon aria-hidden className="ml-auto size-3.5 shrink-0" />
        ) : null}
      </ComboboxPrimitive.Item>
    )
  }

  /** What stands in for the list when there is none: it is what the search controls then. */
  const status = () => {
    if (loadingMessage !== undefined) {
      return (
        <EmptyState
          state="loading"
          variant="plain"
          size="compact"
          title={loadingMessage}
        />
      )
    }
    if (error) {
      return (
        <EmptyState
          state="failed"
          variant="plain"
          size="compact"
          title={error}
          onRetry={onRetry}
        />
      )
    }
    return <EmptyState variant="plain" size="compact" title={message} />
  }

  const body = () => {
    if (!listShown) {
      return (
        <div id={statusId} className="py-2">
          {status()}
        </div>
      )
    }
    const groups = groupComboboxItems(visible)
    return (
      <ComboboxPrimitive.List
        ref={listRef}
        id={listId}
        {...naming}
        className={comboboxList}
      >
        {groups.map((group, index) =>
          group.label === null ? (
            <Fragment key={`ungrouped-${index}`}>
              {group.items.map(renderItem)}
            </Fragment>
          ) : (
            <ComboboxPrimitive.Group
              key={`${group.label}-${index}`}
              className="not-first:mt-1"
            >
              <ComboboxPrimitive.GroupLabel className={comboboxGroupLabel}>
                {group.label}
              </ComboboxPrimitive.GroupLabel>
              {group.items.map(renderItem)}
            </ComboboxPrimitive.Group>
          ),
        )}
      </ComboboxPrimitive.List>
    )
  }

  const shared = {
    open,
    onOpenChange: setOpen,
    disabled: isDisabled,
    inputValue: query,
    onInputValueChange: (next: string) => setQuery(next),
    // Ours: the filter matches the label, the description and the badge, and
    // Base UI is told what it kept, so the highlight never points at a row
    // that has gone.
    items: items.map((item) => item.id),
    filteredItems: listShown ? visible.map((item) => item.id) : [],
    autoHighlight: true,
    itemToStringLabel: (id: string) =>
      items.find((item) => item.id === id)?.label ?? id,
  }

  const content = (
    <>
      <ComboboxPrimitive.Trigger
        ref={setTrigger}
        aria-label={name}
        {...(variant === 'field'
          ? {
              'data-slot': 'combobox-trigger',
              'data-size': size,
              className: cn(
                'w-fit min-w-0',
                fieldTrigger,
                fieldTriggerSize[size],
                className,
              ),
            }
          : {
              render: (
                <Button
                  variant={variant}
                  size={size}
                  className={cn('min-w-0 justify-between', className)}
                />
              ),
            })}
      >
        <span className={comboboxNameRow}>
          {triggerIcon}
          <span className="truncate">{value}</span>
          {chosen?.badge && !props.multiple ? (
            <Tooltip label={chosen.badge.title}>
              <Badge tone="warning" shape="label">
                {chosen.badge.label}
              </Badge>
            </Tooltip>
          ) : null}
        </span>
        {chevron ? (
          <ChevronDownIcon
            aria-hidden
            className={variant === 'field' ? FIELD_CHEVRON : CHEVRON}
          />
        ) : null}
      </ComboboxPrimitive.Trigger>
      <ComboboxPrimitive.Portal container={container}>
        <ComboboxPrimitive.Positioner
          align="start"
          sideOffset={4}
          collisionPadding={16}
          className={comboboxPositioner}
        >
          <ComboboxPrimitive.Popup
            // The popup is a dialog to assistive tech; it takes its trigger's
            // name, so it is announced as the field it belongs to.
            {...naming}
            // With no search, the list takes the focus, so its arrows and
            // Enter work from the keyboard.
            initialFocus={searchable ? undefined : listRef}
            className={cn(comboboxPopup, popupMotion, contentClassName)}
          >
            {searchable ? (
              // Its own Field: in a Field, the search would take that
              // Field's label and its control's id (its trigger's) too.
              <FieldPrimitive.Root className={comboboxSearch}>
                <ComboboxPrimitive.Input
                  aria-label={searchPlaceholder}
                  placeholder={searchPlaceholder}
                  // With no list to show, the field controls what says why.
                  {...(listShown ? {} : { 'aria-controls': statusId })}
                  render={(inputProps) => (
                    <SearchField {...inputProps} size="sm" />
                  )}
                />
              </FieldPrimitive.Root>
            ) : null}
            {body()}
            {action ? (
              <div className={comboboxFooter}>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full justify-start px-2 font-normal"
                  onClick={() => {
                    action.onSelect()
                    setOpen(false)
                  }}
                >
                  {action.icon}
                  {action.label}
                </Button>
              </div>
            ) : null}
            {footer === undefined ? null : (
              <div className={comboboxFooter}>{footer}</div>
            )}
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </>
  )

  if (props.multiple) {
    return (
      <ComboboxPrimitive.Root<string, true>
        {...shared}
        multiple
        value={[...props.selectedIds]}
        onValueChange={(ids) => props.onChange(ids)}
      >
        {content}
      </ComboboxPrimitive.Root>
    )
  }
  const { onChange } = props
  return (
    <ComboboxPrimitive.Root<string>
      {...shared}
      value={props.selectedId}
      onValueChange={(id) => {
        // A pick of the chosen item reports null (cleared); ours never clear,
        // so it is a pick of the same one.
        onChange(id ?? props.selectedId ?? '')
      }}
    >
      {content}
    </ComboboxPrimitive.Root>
  )
}

export {
  Combobox,
  type ComboboxAction,
  type ComboboxItem,
  type ComboboxMultipleProps,
  type ComboboxProps,
  type ComboboxSingleProps,
}
