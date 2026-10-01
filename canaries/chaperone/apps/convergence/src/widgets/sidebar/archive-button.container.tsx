// canary: no-native-confirm
// Asks before archiving with the operating system's confirm box instead of the app's
// ConfirmDialog.
import { Button } from '@convergence/ui'

export function ArchiveButton({ onArchive }: { onArchive: () => void }) {
  const archive = () => {
    if (window.confirm('Archive this conversation?')) onArchive()
  }
  return <Button onClick={archive}>Archive</Button>
}
