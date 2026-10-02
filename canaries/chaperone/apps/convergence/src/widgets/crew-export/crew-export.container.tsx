// canary: use-notify
// Raises its toast straight from sonner, in words of its own, instead of
// notify from @convergence/ui; and types its options with sonner's, too.
import { toast } from 'sonner'
import type { ExternalToast } from 'sonner'

const options: ExternalToast = { description: 'npm exited with code 1' }

export function exportFailed() {
  toast.error('Could not export crew', options)
}
