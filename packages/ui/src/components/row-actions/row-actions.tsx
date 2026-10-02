import { MoreHorizontal } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { IconButton, type IconButtonProps } from '../icon-button/icon-button'
import { Menu, MenuContent, MenuTrigger } from '../menu/menu'

type RowActionsProps = {
  /**
   * What the menu is for, with the row's name in it ("Session actions
   * Rewrite the importer"): the ⋯'s accessible name and its tooltip (R2).
   */
  label: string
  /** The menu's items: MenuItem, MenuSeparator, MenuSub… */
  children: ReactNode
  /** 24 px in a row (R3), the default; a card's corner may take a bigger one. */
  size?: IconButtonProps['size']
  className?: string
}

/** The row under the ⋯ answers its own click: pressing the ⋯ opens the menu only. */
const keepToItself = (event: MouseEvent) => event.stopPropagation()

/**
 * A row's own menu (MAR-3608, NAV-14): a quiet ⋯ IconButton that opens its
 * items under it, end-aligned. It was one stack pasted six times in the
 * sidebar (Menu, a trigger rendering a quiet 24 px IconButton that stopped
 * the click, its tooltip on the left). Put it in ListRow's `actions`: the row
 * keeps the ⋯ in sight while its menu is open, so it never fades out from
 * under its own menu.
 */
function RowActions({
  label,
  children,
  size = 'xs',
  className,
}: RowActionsProps) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <IconButton
            label={label}
            type="button"
            variant="quiet"
            size={size}
            tooltipSide="left"
            onClick={keepToItself}
            className={cn('shrink-0', className)}
          >
            <MoreHorizontal className="size-3.5" />
          </IconButton>
        }
      />
      <MenuContent align="end">{children}</MenuContent>
    </Menu>
  )
}

export { RowActions, type RowActionsProps }
