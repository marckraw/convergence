// canary: ui-package-imports-no-app
// The same reach into the app, spelled with the app's workspace name instead of a path.
import type { DialogKind } from 'convergence/src/entities/dialog'

export function SessionChipDialog({ kind }: { kind: DialogKind }) {
  return <span>{kind}</span>
}
