import { forwardRef } from 'react'
import { StatusPillButton, Tooltip } from '@convergence/ui'

/**
 * A harness alert in the header's row, only while the alert is true (CH4 R3):
 * it names the cause, and opens Details at the harness section. A pressable
 * status pill in the danger tone, the same height as the row's other states
 * (CONV-3); the full words on hover when they are cut short.
 */
export const HarnessAlertChip = forwardRef<
  HTMLButtonElement,
  { label: string; expanded: boolean; onOpen: () => void }
>(({ label, expanded, onOpen }, ref) => (
  <Tooltip label={label}>
    <StatusPillButton
      ref={ref}
      tone="danger"
      aria-haspopup="menu"
      aria-expanded={expanded}
      data-testid="harness-alert"
      onClick={onOpen}
      className="max-w-60"
    >
      {label}
    </StatusPillButton>
  </Tooltip>
))

HarnessAlertChip.displayName = 'HarnessAlertChip'
