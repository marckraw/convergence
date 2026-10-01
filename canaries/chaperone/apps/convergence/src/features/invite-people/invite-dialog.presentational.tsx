// canary: use-focus-ring, no-invisible-focus-ring, use-spinner, use-form-error, use-button-sizes, no-title-on-buttons, raw-elements-need-a-reason, app-parts-have-stories
// A dialog from before the design system had the parts: a typed focus ring that draws nothing, a
// hand-built spinner and error line, a Button resized and titled by hand, a raw button with no
// reason, and no invite-dialog.stories.tsx beside it. The textarea says why it is raw and the
// link is handed to a part's render prop, so neither of those is reported.
import { Button, ListRow } from '@convergence/ui'
import { Loader2, X } from 'lucide-react'

const pick =
  'rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2'

type InviteDialogProps = {
  error: string | null
  slow: boolean
  url: string
  onClose: () => void
}

export function InviteDialog({ error, slow, url, onClose }: InviteDialogProps) {
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="size-6"
        aria-label="Close"
        title="Close"
        onClick={onClose}
      >
        <X aria-hidden />
      </Button>
      <button type="button" className={pick}>
        Piotr
      </button>
      {/* raw-element: the note grows with its text, which Textarea doesn't */}
      <textarea aria-label="Note" />
      <ListRow render={<a href={url} />}>Open the invite</ListRow>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {slow ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : null}
    </div>
  )
}
