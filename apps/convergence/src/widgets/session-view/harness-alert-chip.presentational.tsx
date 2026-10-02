import { forwardRef } from 'react'
import { MetaLine, StatusPillButton, Tooltip } from '@convergence/ui'

/**
 * A harness alert in the header's row, only while the alert is true (CH4 R3):
 * it names the cause, and opens Details at the harness section. A pressable
 * status pill in the danger tone, the same height as the row's other states
 * (CONV-3); its facts on a MetaLine (CONV-23), and the full words on hover
 * when they are cut short.
 */
export const HarnessAlertChip = forwardRef<
  HTMLButtonElement,
  { facts: readonly string[]; expanded: boolean; onOpen: () => void }
>(({ facts, expanded, onOpen }, ref) => (
  // The tooltip is plain text, so its facts are joined as the line reads.
  <Tooltip label={facts.join(' · ')}>
    <StatusPillButton
      ref={ref}
      tone="danger"
      aria-haspopup="menu"
      aria-expanded={expanded}
      data-testid="harness-alert"
      onClick={onOpen}
      className="max-w-60"
    >
      <MetaLine>{facts}</MetaLine>
    </StatusPillButton>
  </Tooltip>
))

HarnessAlertChip.displayName = 'HarnessAlertChip'
