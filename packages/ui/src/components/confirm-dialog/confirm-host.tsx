import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'
import { ConfirmDialog, type ConfirmVariant } from './confirm-dialog'

/** What a confirmation asks, in ConfirmDialog's words. */
type ConfirmOptions = {
  /** The question: "Delete this conversation?". */
  title: ReactNode
  /** What it does, and what stays. */
  description: ReactNode
  /** The button that does it, as a verb that names the action: "Delete". */
  confirmLabel: ReactNode
  /** Cancel's words; "Cancel" unless told otherwise. */
  cancelLabel?: ReactNode
  /** `danger` for what can't be undone: the red button, the focus on Cancel (R5). */
  variant?: ConfirmVariant
}

/** Asks, and answers true for the action, false for Cancel, Escape or the ✕. */
type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

type Asking = {
  options: ConfirmOptions
  answer: (confirmed: boolean) => void
}

type ConfirmHostProps = {
  children: ReactNode
}

/**
 * Shows every confirmation asked through `useConfirm()` (MAR-3616, R5), one
 * at a time, in a ConfirmDialog. UiProvider mounts it at the app's root; a
 * host under another leaves the asking to the outer one. A question asked
 * while another is open waits its turn.
 */
function ConfirmHost({ children }: ConfirmHostProps) {
  const outer = useContext(ConfirmContext)
  const waiting = useRef<Asking[]>([])
  const shown = useRef<Asking | null>(null)
  const [asking, setAsking] = useState<Asking | null>(null)
  const [open, setOpen] = useState(false)

  const show = useCallback((next: Asking | null) => {
    shown.current = next
    setAsking(next)
    setOpen(next !== null)
  }, [])

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        const next: Asking = { options, answer: resolve }
        if (shown.current) waiting.current.push(next)
        else show(next)
      }),
    [show],
  )

  const answer = (confirmed: boolean) => {
    if (!asking || !open) return
    asking.answer(confirmed)
    setOpen(false)
  }

  if (outer) return children
  return (
    <ConfirmContext value={confirm}>
      {children}
      {asking ? (
        <ConfirmHostDialog
          asking={asking}
          open={open}
          onAnswer={answer}
          onClosed={() => show(waiting.current.shift() ?? null)}
        />
      ) : null}
    </ConfirmContext>
  )
}

type ConfirmHostDialogProps = {
  asking: Asking
  open: boolean
  onAnswer: (confirmed: boolean) => void
  /** The dialog has finished leaving: the next question can come. */
  onClosed: () => void
}

/** The one question being asked now. */
function ConfirmHostDialog({
  asking,
  open,
  onAnswer,
  onClosed,
}: ConfirmHostDialogProps) {
  const { options } = asking
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onAnswer(false)
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed()
      }}
      title={options.title}
      description={options.description}
      confirmLabel={options.confirmLabel}
      cancelLabel={options.cancelLabel}
      variant={options.variant}
      onConfirm={() => onAnswer(true)}
    />
  )
}

/** With no host above, asking fails loudly, and only when it is asked. */
const noHost: Confirm = () =>
  Promise.reject(
    new Error(
      'useConfirm needs a ConfirmHost above it: mount UiProvider at the root.',
    ),
  )

/**
 * Asks before something that can't be undone (MAR-3616, R5), from an event
 * handler, in one line: `if (!(await confirm({ title, description,
 * confirmLabel: 'Delete', variant: 'danger' }))) return`. Never the
 * browser's `window.confirm`. Needs UiProvider (or a ConfirmHost) above; a
 * component that only might ask renders without one, and asking without one
 * rejects.
 */
function useConfirm(): Confirm {
  return useContext(ConfirmContext) ?? noHost
}

export {
  type Confirm,
  ConfirmHost,
  type ConfirmHostProps,
  type ConfirmOptions,
  useConfirm,
}
