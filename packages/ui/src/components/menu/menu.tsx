import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { cva, type VariantProps } from 'class-variance-authority'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '#lib/cn.pure'
import {
  popupItem,
  popupItemCheck,
  popupLabel,
  popupMotion,
  popupSeparator,
  popupSurface,
} from '../../motion/popup.styles'
import { Kbd, type KbdProps } from '../kbd/kbd'
import { tooltipAttributes } from '../tooltip/tooltip'

type MenuProps = MenuPrimitive.Root.Props

/**
 * A list of actions or options that opens from a trigger (MAR-3616): a
 * conversation's actions, the view options, the sidebar's tools. It reaches
 * only its items by keyboard, so a panel of plain buttons or fields is a
 * Popover instead. `onOpenChange(open, { reason, event })` says why it opened
 * or closed: `trigger-press`, `item-press`, `outside-press`, `escape-key`,
 * `focus-out`.
 *
 * Words (R10): an item that opens a dialog or a confirmation ends in "…"
 * ("Rename…", "Delete project…"); one that acts at once does not.
 */
function Menu(props: MenuProps) {
  return <MenuPrimitive.Root {...props} />
}

type MenuTriggerProps = Omit<MenuPrimitive.Trigger.Props, 'className'> & {
  className?: string
}

/**
 * What opens the menu. `render` makes an existing Button or IconButton the
 * trigger: `<MenuTrigger render={<IconButton label="More actions" />}>`.
 */
function MenuTrigger({ className, ...props }: MenuTriggerProps) {
  return (
    <MenuPrimitive.Trigger
      data-slot="menu-trigger"
      className={className}
      {...props}
    />
  )
}

type MenuContentProps = Omit<MenuPrimitive.Popup.Props, 'className'> &
  Pick<
    MenuPrimitive.Positioner.Props,
    | 'align'
    | 'alignOffset'
    | 'anchor'
    | 'collisionPadding'
    | 'side'
    | 'sideOffset'
  > & {
    className?: string
  }

/**
 * The menu itself, on the one popup surface (R8). It grows from its trigger,
 * and its items work from the first frame: nothing waits for the animation.
 * When it closes the focus goes back to the trigger; `finalFocus` sends it
 * elsewhere (`false` leaves it where it is). It is `app-no-drag`, so it can
 * open over the window's title strip (MAR-3284).
 */
function MenuContent({
  align = 'center',
  alignOffset = 0,
  anchor,
  collisionPadding,
  side = 'bottom',
  sideOffset = 4,
  className,
  ...props
}: MenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none app-no-drag"
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            popupSurface,
            'max-h-(--available-height) min-w-32 max-w-(--available-width) overflow-x-hidden overflow-y-auto',
            'p-1 outline-none app-no-drag',
            popupMotion,
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

type MenuGroupProps = Omit<MenuPrimitive.Group.Props, 'className'> & {
  className?: string
}

/** Items that belong together, named by a MenuLabel inside. */
function MenuGroup({ className, ...props }: MenuGroupProps) {
  return (
    <MenuPrimitive.Group
      data-slot="menu-group"
      className={className}
      {...props}
    />
  )
}

type MenuLabelProps = Omit<MenuPrimitive.GroupLabel.Props, 'className'> & {
  className?: string
  /** Line up with items that have an icon or a check. */
  inset?: boolean
}

/** Names a group of items. Inside a MenuGroup. */
function MenuLabel({ className, inset, ...props }: MenuLabelProps) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-label"
      data-inset={inset || undefined}
      className={cn(popupLabel, 'data-inset:pl-8', className)}
      {...props}
    />
  )
}

const menuItemVariants = cva([popupItem, 'data-inset:pl-8'], {
  variants: {
    /** What the item means, not how it looks. */
    variant: {
      default: '',
      /**
       * Destructive: delete, remove, leave (R5). The one red in a menu, and
       * always labelled with a word. Today's red item: the danger ink on
       * the usual highlight.
       */
      danger: 'text-danger-ink data-highlighted:text-danger-ink',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

type MenuItemProps = Omit<MenuPrimitive.Item.Props, 'className'> &
  VariantProps<typeof menuItemVariants> & {
    className?: string
    /** Line up with items that have an icon or a check. */
    inset?: boolean
    /**
     * Why it can't be chosen now (R2): the item is disabled, still reached by
     * the arrow keys and the pointer, the reason is its accessible
     * description, and its tooltip says why. Empty or missing: available,
     * unless `disabled`.
     */
    disabledReason?: string
  }

/**
 * One action, run by `onClick` (the pointer, Enter or Space). It closes the
 * menu when chosen; `closeOnClick={false}` keeps it open.
 */
function MenuItem({
  className,
  inset,
  variant,
  disabled,
  disabledReason,
  ...props
}: MenuItemProps) {
  const reason = disabledReason || undefined
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      data-inset={inset || undefined}
      data-variant={variant ?? 'default'}
      className={cn(
        menuItemVariants({ variant }),
        // A reason keeps the pointer, so its tooltip shows.
        reason && 'data-disabled:pointer-events-auto',
        className,
      )}
      disabled={disabled || Boolean(reason)}
      aria-description={reason}
      {...tooltipAttributes(reason, { side: 'right' })}
      {...props}
    />
  )
}

type MenuSubProps = MenuPrimitive.SubmenuRoot.Props

/** A submenu: MenuSubTrigger and MenuSubContent inside. */
function MenuSub(props: MenuSubProps) {
  return <MenuPrimitive.SubmenuRoot {...props} />
}

type MenuSubTriggerProps = Omit<
  MenuPrimitive.SubmenuTrigger.Props,
  'className'
> & {
  className?: string
  inset?: boolean
}

/** The item that opens a submenu, with a chevron at its end. */
function MenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuSubTriggerProps) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="menu-sub-trigger"
      data-inset={inset || undefined}
      className={cn(
        menuItemVariants({ variant: 'default' }),
        'data-popup-open:bg-highlight data-popup-open:text-on-highlight',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon aria-hidden className="ml-auto size-4" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

// The submenu's border and padding, so its first item lines up with the item
// that opened it.
const submenuAlignOffset = -5

type MenuSubContentProps = MenuContentProps

/** A submenu's panel. It grows from the item that opened it. */
function MenuSubContent({
  align = 'start',
  alignOffset = submenuAlignOffset,
  side = 'right',
  sideOffset = 0,
  ...props
}: MenuSubContentProps) {
  return (
    <MenuContent
      data-slot="menu-sub-content"
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

/** A checkbox or radio item: an item with room at its end for the check. */
const checkableItem = cn(menuItemVariants({ variant: 'default' }), 'pr-8')

type MenuCheckboxItemProps = Omit<
  MenuPrimitive.CheckboxItem.Props,
  'className'
> & {
  className?: string
  inset?: boolean
}

/**
 * An option that is on or off (`checked`, `onCheckedChange`), with a check
 * when on, read out as a menuitemcheckbox. It stays open when chosen unless
 * `closeOnClick`.
 */
function MenuCheckboxItem({
  className,
  children,
  inset,
  ...props
}: MenuCheckboxItemProps) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      data-inset={inset || undefined}
      className={cn(checkableItem, className)}
      {...props}
    >
      <span className={popupItemCheck}>
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon aria-hidden className="size-4" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

type MenuRadioGroupProps = Omit<MenuPrimitive.RadioGroup.Props, 'className'> & {
  className?: string
}

/** A set of options of which exactly one is chosen (`value`, `onValueChange`). */
function MenuRadioGroup({ className, ...props }: MenuRadioGroupProps) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="menu-radio-group"
      className={className}
      {...props}
    />
  )
}

type MenuRadioItemProps = Omit<MenuPrimitive.RadioItem.Props, 'className'> & {
  className?: string
  inset?: boolean
}

/** One of a MenuRadioGroup's options, with a check when it is the one. */
function MenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuRadioItemProps) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      data-inset={inset || undefined}
      className={cn(checkableItem, className)}
      {...props}
    >
      <span className={popupItemCheck}>
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon aria-hidden className="size-4" />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

type MenuSeparatorProps = Omit<MenuPrimitive.Separator.Props, 'className'> & {
  className?: string
}

/** The hairline between groups of items. */
function MenuSeparator({ className, ...props }: MenuSeparatorProps) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn(popupSeparator, className)}
      {...props}
    />
  )
}

type MenuShortcutProps = KbdProps

/**
 * The item's keyboard shortcut, at its end: a Kbd, the one look for a key.
 * Formatted by the app (`formatShortcutLabel`) before it gets here.
 */
function MenuShortcut({ className, ...props }: MenuShortcutProps) {
  return (
    <Kbd
      data-slot="menu-shortcut"
      className={cn('ml-auto', className)}
      {...props}
    />
  )
}

type MenuItemValueProps = Omit<ComponentProps<'span'>, 'className' | 'id'> & {
  className?: string
  /** Its id: give the item `aria-describedby` this id. */
  id: string
}

/**
 * What an item is set to now, muted at its end: the model a conversation
 * runs on. It takes the room the label leaves, so a long one is cut short,
 * never the label. It is the item's description, not part of its name, so
 * give the item `aria-describedby` its id; hidden from the name, it is still
 * read as the description.
 */
function MenuItemValue({ className, ...props }: MenuItemValueProps) {
  return (
    <span
      data-slot="menu-item-value"
      aria-hidden
      className={cn(
        'min-w-0 flex-1 truncate pl-4 text-right text-xs text-ink-muted',
        className,
      )}
      {...props}
    />
  )
}

export {
  Menu,
  MenuCheckboxItem,
  type MenuCheckboxItemProps,
  MenuContent,
  type MenuContentProps,
  MenuGroup,
  type MenuGroupProps,
  MenuItem,
  type MenuItemProps,
  MenuItemValue,
  type MenuItemValueProps,
  MenuLabel,
  type MenuLabelProps,
  type MenuProps,
  MenuRadioGroup,
  type MenuRadioGroupProps,
  MenuRadioItem,
  type MenuRadioItemProps,
  MenuSeparator,
  type MenuSeparatorProps,
  MenuShortcut,
  type MenuShortcutProps,
  MenuSub,
  MenuSubContent,
  type MenuSubContentProps,
  type MenuSubProps,
  MenuSubTrigger,
  type MenuSubTriggerProps,
  MenuTrigger,
  type MenuTriggerProps,
}
