import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#lib/cn.pure'
import { fadeMotion, growMotion } from '../../motion/popup.styles'
import { IconButton } from '../icon-button/icon-button'

type DialogProps = DialogPrimitive.Root.Props

/**
 * A window over the app that asks for attention: a form, a picker, a
 * confirmation (MAR-3616). `onOpenChange(open, { reason, event })` says why
 * it opened or closed. A dialog inside a dialog stacks on it: Escape and the
 * ✕ close the top one, and the focus goes back to the one underneath.
 *
 * How it ends (R6): a dialog that saves as you go ends in one Done
 * (FormDialog `saves="as-you-go"`); one that saves on demand ends in Cancel,
 * then Save (`saves="on-save"`); a dialog you pick from and leave has no
 * footer at all.
 */
function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root {...props} />
}

type DialogTriggerProps = Omit<DialogPrimitive.Trigger.Props, 'className'> & {
  className?: string
}

/** What opens the dialog. `render` makes an existing Button the trigger. */
function DialogTrigger({ className, ...props }: DialogTriggerProps) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      className={className}
      {...props}
    />
  )
}

type DialogCloseProps = Omit<DialogPrimitive.Close.Props, 'className'> & {
  className?: string
}

/** Closes the dialog. `render` makes a Button of it: Cancel, Done. */
function DialogClose({ className, ...props }: DialogCloseProps) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      className={className}
      {...props}
    />
  )
}

/**
 * Widths: 420, 560, 720 (today's, the default), 960 and 1280 px (the
 * --layout-dialog tokens), each at most the window less 1 rem a side (the
 * viewport's padding), and the whole window less that.
 */
const DIALOG_SIZES = {
  sm: 'w-full max-w-dialog-sm',
  md: 'w-full max-w-dialog-md',
  lg: 'w-full max-w-dialog',
  xl: 'w-full max-w-dialog-xl',
  '2xl': 'w-full max-w-dialog-2xl',
  full: 'w-full',
} as const

type DialogSize = keyof typeof DIALOG_SIZES

/**
 * How tall: `fit` grows with what it holds, up to 80% of the window (or
 * 720 px); `tall` keeps one height, `--layout-dialog-tall` (92% of the
 * window, at most 960 px), so a dialog with tabs, panes or a list that
 * streams in doesn't jump as they change (DS4).
 */
const DIALOG_HEIGHTS = {
  fit: '',
  tall: 'h-dialog-tall max-h-dialog-tall',
} as const

type DialogHeight = keyof typeof DIALOG_HEIGHTS

/** The scrim behind a dialog: black at 55% over a light blur, in both themes. */
const dialogBackdrop = cn(
  'fixed inset-0 z-50 bg-scrim backdrop-blur-scrim app-no-drag',
  fadeMotion,
)

type DialogContentProps = Omit<DialogPrimitive.Popup.Props, 'className'> & {
  className?: string
  /** How wide: `lg` (720 px) unless told otherwise. */
  size?: DialogSize
  /** How tall: `fit` (its content, up to 80% of the window) unless told otherwise. */
  height?: DialogHeight
  /**
   * The ✕ in the corner, there unless told otherwise: one way out that looks
   * the same in every dialog. Leave it out only where the dialog brings its
   * own close.
   */
  showClose?: boolean
}

/**
 * The dialog itself: centred over a scrim, at most 80% of the window's
 * height, scrolling inside its body when it is long. It grows in and fades
 * in, and leaves faster; there is no trigger to grow from. Focus moves in at
 * once (to the first control, or `initialFocus`), stays inside while it is
 * open, and goes back to what opened it when it closes (or `finalFocus`).
 * The scrim and the box are `app-no-drag`, so the window's title strip
 * underneath never steals a click. It has no padding of its own: its
 * DialogHeader, DialogBody and DialogFooter bring theirs.
 */
function DialogContent({
  className,
  children,
  size = 'lg',
  height = 'fit',
  showClose = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className={dialogBackdrop}
      />
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 app-no-drag"
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-size={size}
          data-height={height}
          className={cn(
            'relative flex max-h-dialog min-h-0 flex-col overflow-hidden',
            'rounded-xl border border-line bg-sheet text-ink shadow-overlay outline-none app-no-drag',
            DIALOG_SIZES[size],
            DIALOG_HEIGHTS[height],
            growMotion,
            className,
          )}
          {...props}
        >
          {children}
          {showClose ? <DialogCloseCross /> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  )
}

/** The ✕: a quiet 24 px icon button in the top-right corner, named Close. */
function DialogCloseCross() {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      render={
        <IconButton
          label="Close"
          variant="quiet"
          size="xs"
          className="absolute top-3 right-3"
        />
      }
    >
      <XIcon aria-hidden />
    </DialogPrimitive.Close>
  )
}

/**
 * `default` holds the title and the description. `toolbar` is a picker's
 * header: one row of controls (a search, a star) where the title would be,
 * the title then only for a screen reader, with the same line under it and
 * room for the ✕ (DS-17: the model picker typed this row by hand).
 */
type DialogHeaderVariant = 'default' | 'toolbar'

type DialogHeaderProps = Omit<ComponentProps<'div'>, 'className'> & {
  className?: string
  variant?: DialogHeaderVariant
  /**
   * Header actions, before the ✕: Refresh, say (R6). They sit at the end of
   * the title's row.
   */
  actions?: ReactNode
}

/**
 * The title and the description, at the top, with today's padding and the
 * line under them built in, and room for the ✕ (R0: 18 of 25 headers). A
 * `toolbar` header is a row of controls instead, as a picker's search is.
 */
function DialogHeader({
  className,
  variant = 'default',
  actions,
  children,
  ...props
}: DialogHeaderProps) {
  return (
    <div
      data-slot="dialog-header"
      data-variant={variant}
      className={cn(
        'flex shrink-0 border-b border-line-soft bg-sheet',
        variant === 'toolbar'
          ? 'items-center gap-2 px-4 py-3 pr-12'
          : [
              'gap-3 px-6 py-5 pr-14',
              actions ? 'items-start' : 'flex-col gap-1.5',
            ],
        className,
      )}
      {...props}
    >
      {actions ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">{children}</div>
          <div
            data-slot="dialog-header-actions"
            className="inline-flex shrink-0 items-center gap-2"
          >
            {actions}
          </div>
        </>
      ) : (
        children
      )}
    </div>
  )
}

type DialogBodyProps = Omit<ComponentProps<'div'>, 'className'> & {
  className?: string
}

/** What the dialog holds, between its header and its footer: it scrolls, they stay. */
function DialogBody({ className, ...props }: DialogBodyProps) {
  return (
    <div
      data-slot="dialog-body"
      className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', className)}
      {...props}
    />
  )
}

type DialogFooterProps = Omit<ComponentProps<'div'>, 'className'> & {
  className?: string
}

/**
 * The buttons, at the bottom, with today's padding and the line above them:
 * Cancel first, the main action last (16 of 21 footers today).
 */
function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 border-t border-line-soft bg-sheet px-6 py-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

type DialogErrorProps = Omit<ComponentProps<'p'>, 'className' | 'role'> & {
  className?: string
}

/**
 * What went wrong when the dialog tried, above its buttons (R10: "Couldn't
 * delete the prompt."): the danger ink, announced at once as an alert. Pass
 * the error as it is: without one, nothing renders.
 */
function DialogError({ className, children, ...props }: DialogErrorProps) {
  if (children === null || children === undefined || children === false)
    return null
  if (children === '') return null
  return (
    <p
      data-slot="dialog-error"
      role="alert"
      className={cn(
        'px-6 pb-1 text-sm wrap-anywhere text-danger-ink',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  )
}

type DialogTitleProps = Omit<DialogPrimitive.Title.Props, 'className'> & {
  className?: string
}

/** Names the dialog, for screen readers too. Every dialog has one. */
function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg font-semibold', className)}
      {...props}
    />
  )
}

type DialogDescriptionProps = Omit<
  DialogPrimitive.Description.Props,
  'className'
> & {
  className?: string
}

/** What the dialog is for, in a sentence: its accessible description. */
function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-ink-muted', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  type DialogBodyProps,
  DialogClose,
  DialogCloseCross,
  type DialogCloseProps,
  DialogContent,
  type DialogContentProps,
  DialogDescription,
  type DialogDescriptionProps,
  DialogError,
  type DialogErrorProps,
  DialogFooter,
  type DialogFooterProps,
  DialogHeader,
  type DialogHeaderProps,
  type DialogHeaderVariant,
  type DialogHeight,
  type DialogProps,
  type DialogSize,
  DialogTitle,
  type DialogTitleProps,
  DialogTrigger,
  type DialogTriggerProps,
  dialogBackdrop,
}
