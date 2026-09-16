import type { FC } from 'react'

interface SeatRefusalProps {
  /** The door's own sentence, verbatim. */
  message: string
  /** What did not change, in one muted line. */
  kept: string
}

/**
 * A refusal, drawn directly under the field it refuses (MAR-3118 R7): the
 * service's sentence in amber, then what is still in force. The typed text
 * stays in its field — this component never touches it.
 */
export const SeatRefusal: FC<SeatRefusalProps> = ({ message, kept }) => (
  <div data-seat-refusal role="alert" className="flex flex-col gap-0.5">
    <p className="text-[11px] text-amber-400">
      <span aria-hidden className="mr-1 font-semibold">
        !
      </span>
      {message}
    </p>
    <p className="pl-2.5 text-[10px] text-muted-foreground">{kept}</p>
  </div>
)
