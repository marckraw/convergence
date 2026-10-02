import type { FC } from 'react'
import { cn, Tooltip } from '@convergence/ui'
import type { LoomHorseAccessLine as Line } from './loom-horse-access.pure'
import { LOOM_HORSE_ACCESS_TONE } from './loom-horse-access.styles'

/** The horse's Figma and Linear reach, one quiet line (MAR-3519). */
export const LoomHorseAccessLine: FC<{ line: Line }> = ({ line }) => (
  <Tooltip label={line.text} when="truncated">
    <span
      className={cn(
        'block truncate text-2xs leading-4',
        LOOM_HORSE_ACCESS_TONE[line.tone],
      )}
    >
      {line.text}
    </span>
  </Tooltip>
)
