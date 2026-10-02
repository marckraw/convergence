import type { ReactNode } from 'react'
import { toast, type ExternalToast } from 'sonner'
import { failureTitle, reasonOf } from './notify.pure'

/** A button on a toast: what it says, and what it does. The toast leaves after. */
type NotifyAction = {
  label: string
  onClick: () => void
}

type NotifyOptions = {
  /**
   * Names the toast, so a later one with the same id takes its place: a
   * "Downloading…" that becomes "Ready", or an ending that replaces the last.
   */
  id?: string | number
  /** The line under the title: the detail. */
  description?: ReactNode
  /** The one thing to do about it, a primary Button. */
  action?: NotifyAction
  /**
   * A second thing to do, a secondary Button before the action ("Release
   * notes" beside "Download"). Not a Cancel: sonner's cancel slot draws it,
   * and no caller needs to know that.
   */
  secondaryAction?: NotifyAction
  /**
   * Stays until it's acted on or put away, instead of leaving after a few
   * seconds: for news that asks for an answer.
   */
  persistent?: boolean
}

type ToastId = string | number

/** sonner's options for ours, with no key that wasn't asked for. */
const toSonner = ({
  id,
  description,
  action,
  secondaryAction,
  persistent,
}: NotifyOptions = {}): ExternalToast => ({
  ...(id === undefined ? {} : { id }),
  ...(description === undefined ? {} : { description }),
  ...(action ? { action } : {}),
  ...(secondaryAction ? { cancel: secondaryAction } : {}),
  ...(persistent ? { duration: Number.POSITIVE_INFINITY } : {}),
})

/**
 * How the app raises a toast (MAR-3608, DLG-31), over the Toaster part: a
 * kind in R1's tones, and a failure in R10's words.
 *
 * - `failure("update Codex", error)`: "Couldn’t update Codex." with the
 *   error's message under it. Use it for anything the app tried and couldn't.
 * - `error(title)`: a failure someone else already worded, such as a store's
 *   message or a headline that names where something stopped. Prefer
 *   `failure`.
 * - `success`, `info`, `warning`, `message` (neutral, no glyph) and
 *   `loading` (a Spinner, until a toast with the same id replaces it).
 *
 * Each returns the toast's id; `dismiss(id)` puts one away, `dismiss()` all.
 */
const notify = {
  success: (title: ReactNode, options?: NotifyOptions): ToastId =>
    toast.success(title, toSonner(options)),
  info: (title: ReactNode, options?: NotifyOptions): ToastId =>
    toast.info(title, toSonner(options)),
  warning: (title: ReactNode, options?: NotifyOptions): ToastId =>
    toast.warning(title, toSonner(options)),
  message: (title: ReactNode, options?: NotifyOptions): ToastId =>
    toast(title, toSonner(options)),
  loading: (title: ReactNode, options?: NotifyOptions): ToastId =>
    toast.loading(title, toSonner(options)),
  error: (title: ReactNode, options?: NotifyOptions): ToastId =>
    toast.error(title, toSonner(options)),
  failure: (
    what: string,
    reason?: unknown,
    options?: Omit<NotifyOptions, 'description'>,
  ): ToastId =>
    toast.error(
      failureTitle(what),
      toSonner({ ...options, description: reasonOf(reason) }),
    ),
  dismiss: (id?: ToastId): ToastId => toast.dismiss(id),
}

export { notify, type NotifyAction, type NotifyOptions }
