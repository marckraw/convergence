// canary: raw-elements-need-a-reason
// A field from before Field (DS-13): its label typed by hand around the
// input, so nothing ties a hint or an error to it. The <label> is its only
// raw element (the Input is the design system's), so the rule fires on the
// label alone.
import { Input } from '@convergence/ui'

type InviteEmailProps = { value: string; onChange: (value: string) => void }

export function InviteEmail({ value, onChange }: InviteEmailProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-muted">
      Email
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
