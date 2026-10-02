import type { OptionRowCatalog } from '@/entities/session'
import {
  workAddressReadyForSend,
  type WorkAddressSlotView,
} from '@/entities/execution-host'

/**
 * Whether this composer may send at all — one derivation, read by both ways
 * of sending (CONV-30: it moved here from the composer's render).
 *
 * The button and ⌘↵ each used to spell their own version out, and they had
 * already drifted: the keyboard path knew nothing of the option row or the
 * attachment ingest, so every guard added to the button was a guard the
 * keyboard did not have. That is how a send could leave while the strip was
 * still asking where the session works — through the shortcut he actually
 * uses (MAR-2689). Two encodings of one fact need one derivation, applied at
 * both.
 */
export function composerCanSend(input: {
  disabled: boolean
  optionRow: Pick<OptionRowCatalog, 'status'>
  workAddress: WorkAddressSlotView
  hasAttachmentErrors: boolean
  attachmentsIngestInFlight: boolean
  value: string
  attachmentCount: number
  hasPendingAnnotations: boolean
}): boolean {
  return (
    !input.disabled &&
    // Nothing to send *to* until the machine says what it runs. Never true for
    // this machine, so a Local composer's send button is what it always was.
    // Keyed on the row having no options at all, not on there being a
    // sentence: a listing the daemon could not re-confirm carries one and is
    // still a row a session can be started from (MAR-2682, "a dead daemon
    // must not look alive").
    input.optionRow.status !== 'notice' &&
    // And nothing to send *to* until the strip can say where on that machine
    // the session will work. Keyed on the slot the same way the line above is
    // keyed on the option row, and for the same reason: a session born while
    // the place is still being asked about records no place at all, and the
    // start then falls back to the silent derivation this slice replaced
    // (MAR-2689). Always true on Local, whose slot does not exist.
    workAddressReadyForSend(input.workAddress) &&
    !input.hasAttachmentErrors &&
    !input.attachmentsIngestInFlight &&
    // Something to send: words, a file, or annotations waiting in the tray,
    // which are message content too (RA2).
    (input.value.trim().length > 0 ||
      input.attachmentCount > 0 ||
      input.hasPendingAnnotations)
  )
}
