// canary: ui-package-imports-no-app
// A design-system part that climbs out of the package into the app's tree for a type, instead of
// taking what it needs as props.
import type { SessionSummary } from '../../../../../apps/convergence/src/entities/session/session.types'

export function SessionChip({ session }: { session: SessionSummary }) {
  return <span>{session.name}</span>
}
