import { forwardRef } from 'react'
import { Button, Tooltip } from '@convergence/ui'

/**
 * A harness alert in the header's row, only while the alert is true (CH4 R3):
 * it names the cause, and opens Details at the harness section.
 */
export const HarnessAlertChip = forwardRef<
  HTMLButtonElement,
  { label: string; expanded: boolean; onOpen: () => void }
>(({ label, expanded, onOpen }, ref) => (
  <Tooltip label={label}>
    <Button
      ref={ref}
      type="button"
      variant="danger-quiet"
      aria-haspopup="menu"
      aria-expanded={expanded}
      data-testid="harness-alert"
      onClick={onOpen}
      size="sm"
      className="max-w-[15rem] rounded-full border border-destructive/50 text-[11px]"
    >
      <span className="min-w-0 truncate">{label}</span>
    </Button>
  </Tooltip>
))

HarnessAlertChip.displayName = 'HarnessAlertChip'
