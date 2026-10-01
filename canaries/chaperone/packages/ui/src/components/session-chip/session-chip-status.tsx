// canary: ui-package-imports-no-app
// A part that reads the app's store through the app's @/ alias.
import { useSessionStore } from '@/entities/session'

export function SessionChipStatus() {
  return <span>{useSessionStore().status}</span>
}
