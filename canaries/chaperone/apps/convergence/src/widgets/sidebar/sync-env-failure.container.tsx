// canary: no-ascii-couldnt
// Failures typed with the ASCII apostrophe where R10 and notify write "Couldn’t": a dialog's
// error, a Notice title in JSX, and a template literal. A comment that says Couldn't, as this
// one does, is not reported.
import { DialogError, Notice } from '@convergence/ui'

export function SyncEnvFailure({ reason }: { reason: string }) {
  const headline = "Couldn't sync the env files."
  return (
    <div>
      <DialogError detail={reason}>{headline}</DialogError>
      <Notice tone="danger" title={`Couldn't copy ${reason}`} />
      <p>Couldn't open the project.</p>
    </div>
  )
}
