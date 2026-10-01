import type { FC } from 'react'
import { Button } from '@convergence/ui'

/**
 * Loom's Refresh control (MAR-3227 R6): the word, and when the tracker was
 * last read. No spinner: a read is short, and its answer is the age going
 * back to zero -- a spinner would be the control claiming work it cannot see.
 */
export const LoomRefreshView: FC<{
  label: string
  blocked: boolean
  onRefresh: () => void
}> = ({ label, blocked, onRefresh }) => (
  <span data-loom-refresh className="flex items-center gap-1.5 text-2xs">
    <Button
      type="button"
      variant="ghost"
      disabled={blocked}
      onClick={onRefresh}
      size="xs"
      className="px-1.5"
    >
      Refresh
    </Button>
    <span className="text-muted-foreground">{label}</span>
  </span>
)
