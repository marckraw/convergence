import type { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { type ReactNode, useRef } from 'react'
import { useDelayedLoading } from '../../motion/delayed-loading/useDelayedLoading'
import { Button } from '../button/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogError,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../dialog/dialog'

type ConfirmVariant = 'default' | 'danger'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once it has finished opening or closing, its animation included. */
  onOpenChangeComplete?: (open: boolean) => void
  /** The question: "Delete this conversation?", "Close running terminal?". */
  title: ReactNode
  /** What it does, and what stays, in a sentence or two. */
  description: ReactNode
  /** The button that does it, as a verb that names the action: "Delete", "Close anyway" (R5). */
  confirmLabel: ReactNode
  /** What that button says while it's at it: "Deleting…" (R10). */
  pendingLabel?: ReactNode
  /** Cancel's words; "Cancel" unless told otherwise. */
  cancelLabel?: ReactNode
  /**
   * `danger`: it deletes, removes or stops for good (R5). The button is the
   * red one, and the focus starts on Cancel, so a stray Enter keeps
   * everything as it was.
   */
  variant?: ConfirmVariant
  /**
   * It's under way. The button says so (pendingLabel, a spinner, aria-busy)
   * once it has taken 300 ms, so a quick answer never flashes it; meanwhile
   * more presses do nothing.
   */
  pending?: boolean
  /** It didn't work: why, and what to do. Shown above the buttons; the button tries again. */
  error?: ReactNode
  /** Anything the question needs besides its words: the list of what goes. */
  children?: ReactNode
  onConfirm: () => void
  /** What gets the focus back when it closes, when it isn't what opened it: a menu's trigger. */
  finalFocus?: DialogPrimitive.Popup.Props['finalFocus']
}

/**
 * Asks before something that can't be undone in one click (MAR-3616, R5):
 * deleting a conversation, a prompt, a workspace; stopping a task. In the
 * app's own dialog, never the browser's `confirm()`. Cancel, then the action,
 * last; Escape, Cancel and the ✕ keep everything as it was, and the focus
 * goes back where it came from. The red is on the confirming button only,
 * and the button says what it does.
 *
 * For a question asked from an event handler, `useConfirm()` is the
 * one-liner; this is the part for a confirmation that shows its own progress
 * or error.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  onOpenChangeComplete,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Cancel',
  variant = 'default',
  pending = false,
  error,
  children,
  onConfirm,
  finalFocus,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const busy = useDelayedLoading(pending)
  const danger = variant === 'danger'
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DialogContent
        size="sm"
        role="alertdialog"
        data-variant={variant}
        initialFocus={danger ? cancelRef : confirmRef}
        finalFocus={finalFocus}
      >
        <DialogHeader className="border-b-0 pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ? <div className="px-6 pb-3 text-sm">{children}</div> : null}
        <DialogError>{error}</DialogError>
        <DialogFooter className="border-t-0 pt-3">
          <DialogClose ref={cancelRef} render={<Button variant="secondary" />}>
            {cancelLabel}
          </DialogClose>
          <Button
            ref={confirmRef}
            variant={danger ? 'danger' : 'primary'}
            pending={busy}
            pendingLabel={pendingLabel}
            onClick={() => {
              if (!pending) onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { ConfirmDialog, type ConfirmDialogProps, type ConfirmVariant }
