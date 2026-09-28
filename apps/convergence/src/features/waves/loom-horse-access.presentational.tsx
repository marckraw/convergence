import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import type { LoomHorseAccessLine as Line } from './loom-horse-access.pure'
import { LOOM_HORSE_ACCESS_TONE } from './loom-horse-access.styles'

/** The horse's Figma and Linear reach, one quiet line (MAR-3519). */
export const LoomHorseAccessLine: FC<{ line: Line }> = ({ line }) => (
  <span
    className={cn(
      'block truncate text-[11px] leading-4',
      LOOM_HORSE_ACCESS_TONE[line.tone],
    )}
    title={line.text}
  >
    {line.text}
  </span>
)
