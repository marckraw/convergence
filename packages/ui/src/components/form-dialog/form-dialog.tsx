import type { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import type { FormEvent, ReactNode } from 'react'
import { useDelayedLoading } from '../../motion/delayed-loading/useDelayedLoading'
import { Button } from '../button/button'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogError,
  DialogFooter,
  DialogHeader,
  type DialogSize,
  DialogTitle,
} from '../dialog/dialog'

type FormDialogSaves = 'as-you-go' | 'on-save'

type FormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What it edits: "Project settings", "Edit tunnel profile". */
  title: ReactNode
  /** One line on what it is for. */
  description?: ReactNode
  /** How wide: `lg` (720 px) unless told otherwise. */
  size?: DialogSize
  /** Header actions, before the ✕: Refresh, say (R6). */
  headerActions?: ReactNode
  /**
   * How its changes are kept (R6), which decides its ending:
   * - `as-you-go`: each change is saved as it is made. One Done closes it.
   * - `on-save`: nothing is kept until Save. Cancel, then Save; Enter in a
   *   field saves too.
   */
  saves: FormDialogSaves
  /** Keeps the changes: `on-save` only. */
  onSave?: () => void
  /** Save's words, a verb: "Save" unless told otherwise. */
  saveLabel?: ReactNode
  /** Save's words while it is at it: "Saving…" unless told otherwise (R10). */
  pendingLabel?: ReactNode
  /** Why Save is unavailable, if it is: a missing name, say (R2). */
  saveDisabledReason?: string
  /** Saving is under way: Save says so after 300 ms and further presses wait. */
  pending?: boolean
  /** It didn't save: why, and what to do. Shown above the buttons. */
  error?: ReactNode
  /** The form's fields: the dialog's body, which scrolls. */
  children: ReactNode
  /** What gets the focus when it opens, when it isn't the first field. */
  initialFocus?: DialogPrimitive.Popup.Props['initialFocus']
  /** What gets the focus back when it closes, when it isn't what opened it. */
  finalFocus?: DialogPrimitive.Popup.Props['finalFocus']
}

/**
 * A dialog that edits something, ending the way R6 says it must (MAR-3616):
 * Done when every change is kept as it is made, Cancel and Save when nothing
 * is kept until Save. A dialog you pick from and leave is a plain Dialog with
 * no footer. The header, body and footer bring their own padding and lines;
 * an error sits over the buttons, and Save goes busy without moving.
 */
function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  size,
  headerActions,
  saves,
  onSave,
  saveLabel = 'Save',
  pendingLabel = 'Saving…',
  saveDisabledReason,
  pending = false,
  error,
  children,
  initialFocus,
  finalFocus,
}: FormDialogProps) {
  const busy = useDelayedLoading(pending)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saves !== 'on-save' || pending || saveDisabledReason) return
    onSave?.()
  }
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent
        size={size}
        data-saves={saves}
        initialFocus={initialFocus}
        finalFocus={finalFocus}
      >
        <form className="flex min-h-0 grow flex-col" onSubmit={submit}>
          <DialogHeader actions={headerActions}>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogBody>{children}</DialogBody>
          <DialogError className="pt-3">{error}</DialogError>
          <DialogFooter>
            {saves === 'as-you-go' ? (
              <DialogClose render={<Button variant="secondary" />}>
                Done
              </DialogClose>
            ) : (
              <>
                <DialogClose render={<Button variant="secondary" />}>
                  Cancel
                </DialogClose>
                <Button
                  type="submit"
                  pending={busy}
                  pendingLabel={pendingLabel}
                  disabledReason={saveDisabledReason}
                >
                  {saveLabel}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { FormDialog, type FormDialogProps, type FormDialogSaves }
