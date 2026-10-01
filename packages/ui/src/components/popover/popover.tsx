import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import type { ComponentProps } from 'react'
import { cn } from '#lib/cn.pure'
import { popupMotion, popupSurface } from '../../motion/popup.styles'

type PopoverProps = PopoverPrimitive.Root.Props

/**
 * A small panel anchored to a trigger: details, a few choices, a short form
 * (MAR-3616). Not a menu: a panel of plain buttons, fields or text is a
 * Popover, because a Menu reaches only its items by keyboard (DLG-23).
 * `onOpenChange(open, { reason, event })` says why it opened or closed.
 */
function Popover(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />
}

type PopoverTriggerProps = Omit<PopoverPrimitive.Trigger.Props, 'className'> & {
  className?: string
}

/**
 * What opens the popover. `render` makes an existing Button (or IconButton)
 * the trigger; a trigger that is not a button also takes
 * `nativeButton={false}`. `openOnHover`, `delay` and `closeDelay` open it
 * under a resting pointer, as the composer's usage pills do.
 */
function PopoverTrigger({ className, ...props }: PopoverTriggerProps) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={className}
      {...props}
    />
  )
}

type PopoverContentProps = Omit<PopoverPrimitive.Popup.Props, 'className'> &
  Pick<
    PopoverPrimitive.Positioner.Props,
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
 * The panel, on the one popup surface (R8) with today's `p-4` and no fixed
 * width (R0). It grows from its trigger and leaves faster than it came. It is
 * a dialog to assistive tech: name it with a PopoverTitle inside, or with
 * `aria-label`. Focus moves to its first control when it opens (`initialFocus`
 * picks another, `false` keeps it where it is) and back to the trigger when
 * it closes (`finalFocus`). It is `app-no-drag`, so it can open over the
 * window's title strip. Its size can follow Base UI's variables:
 * `--anchor-width` (the trigger's width) and `--available-height`.
 */
function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  anchor,
  collisionPadding,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        collisionPadding={collisionPadding}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50 app-no-drag"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            popupSurface,
            'max-w-(--available-width) p-4 outline-none app-no-drag',
            popupMotion,
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

type PopoverHeaderProps = Omit<ComponentProps<'div'>, 'className'> & {
  className?: string
}

/** Groups the title and the description at the top. */
function PopoverHeader({ className, ...props }: PopoverHeaderProps) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    />
  )
}

type PopoverTitleProps = Omit<PopoverPrimitive.Title.Props, 'className'> & {
  className?: string
}

/** Names the popover, for screen readers too. */
function PopoverTitle({ className, ...props }: PopoverTitleProps) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('text-sm font-semibold', className)}
      {...props}
    />
  )
}

type PopoverDescriptionProps = Omit<
  PopoverPrimitive.Description.Props,
  'className'
> & {
  className?: string
}

/** What the popover is about, in a muted line under its title. */
function PopoverDescription({ className, ...props }: PopoverDescriptionProps) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('text-xs text-ink-muted', className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  type PopoverContentProps,
  PopoverDescription,
  type PopoverDescriptionProps,
  PopoverHeader,
  type PopoverHeaderProps,
  type PopoverProps,
  PopoverTitle,
  type PopoverTitleProps,
  PopoverTrigger,
  type PopoverTriggerProps,
}
