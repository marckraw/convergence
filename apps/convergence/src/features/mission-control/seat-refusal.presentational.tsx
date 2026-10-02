import type { FC } from 'react'
import { FormError } from '@convergence/ui'

interface SeatRefusalProps {
  /** Its id: the refused field's aria-describedby points here (MC-4). */
  id?: string
  /** The door's own sentence, verbatim. */
  message: string
  /** What did not change, in one muted line. */
  kept: string
}

/**
 * A refusal, drawn directly under the field it refuses (MAR-3118 R7): the
 * service's sentence, then what is still in force. The typed text stays in
 * its field — this component never touches it.
 *
 * The door said no, so it reads as every refusal in the app does (MC-18): a
 * FormError, in the danger ink, announced at once, its field marked
 * aria-invalid beside it.
 */
export const SeatRefusal: FC<SeatRefusalProps> = ({ id, message, kept }) => (
  <FormError id={id} data-seat-refusal detail={kept || undefined}>
    {message}
  </FormError>
)
