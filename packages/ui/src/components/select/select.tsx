import { Select as SelectPrimitive } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import {
  type ControlSize,
  fieldTrigger,
  fieldTriggerSize,
} from '#lib/control-frame.styles'
import {
  popupItem,
  popupItemCheck,
  popupLabel,
  popupMotion,
  popupSeparator,
  popupSurface,
} from '../../motion/popup.styles'

/** One choice the trigger can show: its value, and the words it shows for it. */
type SelectOption<Value> = { value: Value; label: ReactNode }

type SelectProps<Value> = Omit<
  SelectPrimitive.Root.Props<Value, false>,
  'items' | 'multiple' | 'onValueChange'
> & {
  /**
   * Every choice, value and label: what the trigger shows for the chosen one.
   * Required, because without it the trigger shows the raw value ("project-1"
   * where it should say "Project"). Build it from the same list the
   * SelectItems map over.
   */
  items: ReadonlyArray<SelectOption<Value>> | Record<string, ReactNode>
  /**
   * The new choice. A Select of ours is never cleared: Base UI reports `null`
   * only for an item whose value is null, which no Select here has, so that
   * case never reaches this handler.
   */
  onValueChange?: (
    value: Value,
    eventDetails: SelectPrimitive.Root.ChangeEventDetails,
  ) => void
}

/**
 * One choice from a short, fixed list (MAR-3616, R9): about eight options or
 * fewer. A longer list, or one to search, is a Combobox. The list opens over
 * the trigger with the chosen item where the value was, as a native select
 * does (`alignItemWithTrigger`), and the trigger shows the chosen label.
 */
function Select<Value>({ onValueChange, ...props }: SelectProps<Value>) {
  return (
    <SelectPrimitive.Root<Value, false>
      {...props}
      onValueChange={
        onValueChange
          ? (value, eventDetails) => {
              if (value !== null) onValueChange(value as Value, eventDetails)
            }
          : undefined
      }
    />
  )
}

type SelectTriggerProps = Omit<SelectPrimitive.Trigger.Props, 'className'> & {
  className?: string
  /** 24, 28, 32 or 36 px; `md` (32) unless told otherwise. Never a className (R3). */
  size?: ControlSize
}

/**
 * The field that shows the choice and opens the list. Give it a name
 * (aria-label, or a FieldLabel in its Field). It wears Input's frame, from
 * the same constant (`fieldTrigger`, DS-15): the control border, the ring
 * over it, and the danger border when it is invalid, by `aria-invalid` or
 * its Field's `invalid`. It is as wide as its value unless told otherwise,
 * and `app-no-drag`.
 */
function SelectTrigger({
  className,
  size = 'md',
  children,
  ...props
}: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn('w-fit', fieldTrigger, fieldTriggerSize[size], className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="flex text-ink-muted">
        <ChevronDownIcon aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

type SelectValueProps = Omit<SelectPrimitive.Value.Props, 'className'> & {
  className?: string
}

/** The chosen label, or the placeholder in muted ink. */
function SelectValue({ className, ...props }: SelectValueProps) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 truncate text-left data-placeholder:text-ink-muted',
        className,
      )}
      {...props}
    />
  )
}

type SelectContentProps = Omit<SelectPrimitive.Popup.Props, 'className'> &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  > & {
    className?: string
  }

/**
 * The list, on the one popup surface (R8). With `alignItemWithTrigger` (the
 * default) it opens over the trigger with the chosen item where the value
 * was, and appears at once, as a native select does; with it off, it grows
 * from below the trigger. It is at least as wide as the trigger and scrolls
 * inside the window.
 */
function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50 select-none outline-none app-no-drag"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            popupSurface,
            'relative max-h-(--available-height) min-w-(--anchor-width) max-w-(--available-width)',
            'overflow-x-hidden overflow-y-auto p-1 outline-none app-no-drag',
            popupMotion,
            // Over the trigger there is nothing to grow from: it is there at
            // once, like a native one.
            'data-[side=none]:transition-none data-[side=none]:data-starting-style:scale-100 data-[side=none]:data-starting-style:opacity-100',
            className,
          )}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow
            data-slot="select-scroll-up"
            className="top-0 z-10 flex w-full items-center justify-center bg-raised py-1 [&_svg]:size-4"
          >
            <ChevronUpIcon aria-hidden />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow
            data-slot="select-scroll-down"
            className="bottom-0 z-10 flex w-full items-center justify-center bg-raised py-1 [&_svg]:size-4"
          >
            <ChevronDownIcon aria-hidden />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

type SelectGroupProps = Omit<SelectPrimitive.Group.Props, 'className'> & {
  className?: string
}

/** Options that belong together, named by a SelectLabel inside. */
function SelectGroup({ className, ...props }: SelectGroupProps) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={className}
      {...props}
    />
  )
}

type SelectLabelProps = Omit<SelectPrimitive.GroupLabel.Props, 'className'> & {
  className?: string
}

/** Names a group of options. */
function SelectLabel({ className, ...props }: SelectLabelProps) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn(popupLabel, className)}
      {...props}
    />
  )
}

type SelectItemProps = Omit<SelectPrimitive.Item.Props, 'className'> & {
  className?: string
}

/** One option, with a check when it is the chosen one. */
function SelectItem({ className, children, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        popupItem,
        "w-full pr-8 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-ink-muted",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 items-center gap-2 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={<span className={popupItemCheck} />}
      >
        <CheckIcon aria-hidden className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

type SelectSeparatorProps = Omit<
  SelectPrimitive.Separator.Props,
  'className'
> & {
  className?: string
}

/** The hairline between groups of options. */
function SelectSeparator({ className, ...props }: SelectSeparatorProps) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none', popupSeparator, className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  type SelectContentProps,
  SelectGroup,
  type SelectGroupProps,
  SelectItem,
  type SelectItemProps,
  SelectLabel,
  type SelectLabelProps,
  type SelectOption,
  type SelectProps,
  SelectSeparator,
  type SelectSeparatorProps,
  SelectTrigger,
  type SelectTriggerProps,
  SelectValue,
  type SelectValueProps,
}
