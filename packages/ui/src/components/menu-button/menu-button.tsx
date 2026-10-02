import { ChevronDown } from 'lucide-react'
import { cn } from '#lib/cn.pure'
import { Button, type ButtonProps } from '../button/button'

type MenuButtonProps = ButtonProps

/**
 * A button that opens a menu or a panel (CONV-33): its words, then a small
 * chevron that says more comes. The conversation header's View, Details and
 * Project, which each typed the same quiet Button and chevron. Ghost and 28
 * px unless told otherwise; hand it to a trigger's `render`
 * (`<MenuTrigger render={<MenuButton />}>View</MenuTrigger>`), or wrap it in
 * one. The chevron is decoration: the words are its name.
 */
function MenuButton({
  variant = 'ghost',
  size = 'sm',
  className,
  children,
  ...props
}: MenuButtonProps) {
  return (
    <Button
      data-slot="menu-button"
      variant={variant}
      size={size}
      className={cn('gap-1', className)}
      {...props}
    >
      {children}
      <ChevronDown aria-hidden className="size-3" />
    </Button>
  )
}

export { MenuButton, type MenuButtonProps }
