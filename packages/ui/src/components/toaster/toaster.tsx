import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import {
  Toaster as Sonner,
  type ToastClassnames,
  type ToasterProps as SonnerProps,
} from 'sonner'
import { cn } from '#lib/cn.pure'
import { toneInk } from '#lib/tone.styles'
import { popupSurface } from '../../motion/popup-surface.styles'
import { Spinner } from '../../motion/spinner/spinner'
import { buttonVariants } from '../button/button'

/** How far the stack stands from the window's edges, in px; 24 on a side not given. */
type ToasterOffset = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

type ToasterProps = {
  /** Room to keep clear, such as a control that owns the window's corner. */
  offset?: ToasterOffset
}

/**
 * A toast is a popup (R8): the popup surface, p-4 around its words as a
 * popover has, in the body size, its title medium and its detail muted. Its
 * buttons are Buttons at 24 px (R3): the action primary, the second one
 * secondary beside it.
 *
 * sonner draws none of it (`unstyled`), so every colour here is a token and
 * follows the theme by itself. What sonner still owns is the stack: where each
 * toast stands, how it enters, leaves and collapses behind the front one.
 * While collapsed, a toast behind the front one hides its words, as sonner's
 * own style does. Under reduced motion a toast fades but doesn't travel, the
 * rule every surface follows; `!` because sonner's own transition is
 * unlayered, so a utility alone can't reach it.
 */
const toastClassNames: ToastClassnames = {
  toast: cn(
    popupSurface,
    'app-no-drag flex w-(--width) items-center gap-2 p-4 font-sans text-sm',
    'data-[expanded=false]:data-[front=false]:*:opacity-0',
    'motion-reduce:transition-opacity! motion-reduce:animate-none!',
  ),
  icon: 'relative flex size-4 shrink-0 items-center justify-center',
  content: 'flex min-w-0 flex-1 flex-col gap-0.5 wrap-anywhere',
  title: 'font-medium',
  description: 'text-ink-muted',
  actionButton: cn(
    buttonVariants({ variant: 'primary', size: 'xs' }),
    'shrink-0',
  ),
  cancelButton: cn(
    buttonVariants({ variant: 'secondary', size: 'xs' }),
    'shrink-0',
  ),
}

/**
 * Each kind's glyph in its tone's ink (R1): success, info, warning and danger
 * for an error. A neutral toast has none. While it works, the Spinner, which
 * stands still under reduced motion.
 */
const toastIcons: SonnerProps['icons'] = {
  success: (
    <CircleCheck aria-hidden className={cn('size-4', toneInk.success)} />
  ),
  info: <Info aria-hidden className={cn('size-4', toneInk.info)} />,
  warning: (
    <TriangleAlert aria-hidden className={cn('size-4', toneInk.warning)} />
  ),
  error: <CircleAlert aria-hidden className={cn('size-4', toneInk.danger)} />,
  loading: <Spinner />,
}

/**
 * The app's one toast stack (MAR-3608, DS-8, NAV-7): bottom right, each toast
 * on the popup surface with its kind in R1's tones. Mount it once, at the
 * root; raise toasts with `notify` (R10's words) or, for what notify doesn't
 * cover, `toast`.
 *
 * sonner's own theme stays at its default on purpose. Unstyled, it paints
 * one thing still: in its dark theme, a toast's detail in a fixed near-white
 * that would beat the token. The tokens already follow the theme.
 */
function Toaster({ offset }: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      offset={offset}
      icons={toastIcons}
      toastOptions={{ unstyled: true, classNames: toastClassNames }}
    />
  )
}

export { Toaster, type ToasterOffset, type ToasterProps }
export { toast } from 'sonner'
