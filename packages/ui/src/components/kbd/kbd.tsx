import type { ComponentProps } from 'react'
import { cn } from '#lib/cn.pure'

type KbdProps = Omit<ComponentProps<'kbd'>, 'className'> & {
  className?: string
}

/**
 * A key, or keys, to press (MAR-3616): "⌘K", "⇧⌘P". A small box outlined in
 * the border color, in the text font and the muted ink, as tall as a badge.
 * The package imports no app code, so the app formats a binding first
 * (`formatShortcutLabel`) and passes the string. Where the control it sits in
 * already says its shortcut, hide it from screen readers with aria-hidden.
 */
function Kbd({ className, ...props }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-sm border border-border',
        'px-1 font-sans text-xs font-normal text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Kbd, type KbdProps }
