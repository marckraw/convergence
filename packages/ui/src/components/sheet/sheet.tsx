import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import type { RefObject } from 'react'
import { cn } from '#lib/cn.pure'
import { fadeMotion } from '../../motion/popup.styles'
import { DialogCloseCross } from '../dialog/dialog'

type SheetProps = DialogPrimitive.Root.Props

/**
 * A panel that slides in from the side of the window, or of a dialog, over
 * what is there (MAR-3616): Parallel work beside a narrow conversation, a
 * skill's details over the Skills grid. It is a dialog underneath: focus
 * moves in and stays while it is open, Escape and a press outside close it,
 * and the focus goes back where it came from. It uses DialogHeader,
 * DialogBody and DialogFooter for its parts, and DialogTitle to be named.
 */
function Sheet(props: SheetProps) {
  return <DialogPrimitive.Root {...props} />
}

/** Widths: 420, 560 and 720 px (the dialogs' scale), at most the space it slides over. */
const SHEET_SIZES = {
  sm: 'w-full max-w-dialog-sm',
  md: 'w-full max-w-dialog-md',
  lg: 'w-full max-w-dialog',
} as const

/**
 * The slide, on Base UI's first and last frames: in over --motion-panel,
 * out in --motion-fast. Reduced motion has it fade where it stands instead.
 */
const SHEET_SLIDE = {
  right: [
    'right-0 border-l',
    'data-starting-style:translate-x-full data-ending-style:translate-x-full',
    'motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-ending-style:translate-x-0',
  ].join(' '),
  left: [
    'left-0 border-r',
    'data-starting-style:-translate-x-full data-ending-style:-translate-x-full',
    'motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-ending-style:translate-x-0',
  ].join(' '),
} as const

type SheetContentProps = Omit<DialogPrimitive.Popup.Props, 'className'> & {
  className?: string
  /** The edge it slides in from: the right unless told otherwise. */
  side?: keyof typeof SHEET_SLIDE
  /** How wide: `md` (560 px) unless told otherwise. */
  size?: keyof typeof SHEET_SIZES
  /** The ✕ in its corner, there unless the sheet brings its own close. */
  showClose?: boolean
  /**
   * Slide over this element instead of the window: a dialog's body, say. It
   * must be positioned (`relative`); the sheet and its lighter scrim fill it.
   */
  container?: RefObject<HTMLElement | null>
}

/**
 * The sheet itself: the full height of what it slides over, at one edge, on
 * the dialogs' surface, over a scrim. It is `app-no-drag`, so the window's
 * title strip underneath never steals a click.
 */
function SheetContent({
  className,
  children,
  side = 'right',
  size = 'md',
  showClose = true,
  container,
  ...props
}: SheetContentProps) {
  const contained = container !== undefined
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Backdrop
        data-slot="sheet-backdrop"
        // A sheet over a dialog is a dialog inside a dialog: Base UI leaves
        // a nested one's scrim out unless asked.
        forceRender
        className={cn(
          'inset-0 z-50 app-no-drag',
          contained
            ? 'absolute bg-scrim-contained'
            : 'fixed bg-scrim backdrop-blur-scrim',
          fadeMotion,
        )}
      />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        data-size={size}
        className={cn(
          'inset-y-0 z-50 flex h-full flex-col overflow-hidden border-line-soft bg-sheet text-ink shadow-overlay outline-none app-no-drag',
          contained ? 'absolute' : 'fixed',
          'transition-motion duration-panel ease-out',
          'data-ending-style:duration-fast data-ending-style:ease-exit',
          'motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0',
          SHEET_SIZES[size],
          SHEET_SLIDE[side],
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? <DialogCloseCross /> : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export { Sheet, SheetContent, type SheetContentProps, type SheetProps }
