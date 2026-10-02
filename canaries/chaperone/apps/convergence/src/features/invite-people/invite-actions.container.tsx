// canary: use-button-sizes
// Buttons put on a size the scale doesn't name: a padding and a text size typed over size="sm",
// a min-height over the default, and every button in a box raised at once. None sets a numeric
// h-, w- or size-, so only the extended rule sees them (DS-4). A link (no box) and a Button grown
// into a row (h-auto, no-buttons-as-rows') are not reported here.
import { Button } from '@convergence/ui'

export function InviteActions({ onSend }: { onSend: () => void }) {
  return (
    <div className="space-y-2 [&_button]:min-h-10">
      <Button size="sm" className="px-3 text-2xs" onClick={onSend}>
        Send invite
      </Button>
      <Button variant="secondary" className="min-h-10">
        Copy link
      </Button>
      <Button variant="link" className="text-xs">
        Learn more
      </Button>
      <Button variant="ghost" className="h-auto w-full px-3 py-2 text-left text-xs">
        Piotr, waiting
      </Button>
    </div>
  )
}
