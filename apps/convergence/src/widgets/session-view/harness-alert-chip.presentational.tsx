import { forwardRef } from 'react'
import { Button } from '@/shared/ui/button'

/**
 * A harness alert in the header's row, only while the alert is true (CH4 R3):
 * it names the cause, and opens Details at the harness section.
 */
export const HarnessAlertChip = forwardRef<
  HTMLButtonElement,
  { label: string; expanded: boolean; onOpen: () => void }
>(({ label, expanded, onOpen }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="ghost"
    size="sm"
    // Capped, so an alert chaining several reasons truncates inside its
    // header row instead of overlapping it; the full label stays in the
    // title (MAR-3427 C).
    className="h-7 max-w-[15rem] rounded-full border border-destructive/50 px-2 text-[11px] text-destructive"
    title={label}
    aria-haspopup="menu"
    aria-expanded={expanded}
    data-testid="harness-alert"
    onClick={onOpen}
  >
    <span className="min-w-0 truncate">{label}</span>
  </Button>
))

HarnessAlertChip.displayName = 'HarnessAlertChip'
