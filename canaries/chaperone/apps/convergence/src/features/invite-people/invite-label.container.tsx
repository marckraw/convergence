// canary: no-raw-input-outside-shared
// A container that labels a switch with a raw <label> instead of ChoiceField (DS8).
import { Switch } from '@convergence/ui'

export function InviteLabelContainer() {
  return (
    <label>
      <Switch /> Send a reminder
    </label>
  )
}
