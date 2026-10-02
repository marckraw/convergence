// canary: use-part-sizes
// The account picker's shape (DS8): a glyph handed in a prop before the className, whose `/>}`
// would end the tag for a pattern that reads only to the first `>`. The rule reads past a glyph
// prop to the part's own className, and its text size and padding are reported.
import { Combobox } from '@convergence/ui'
import { KeyRound } from 'lucide-react'

export function InviteAccount({ onChange }: { onChange: (id: string) => void }) {
  return (
    <Combobox
      value="Current CLI login"
      items={[]}
      onChange={onChange}
      icon={<KeyRound className="size-3.5" />}
      variant="ghost"
      className="gap-1.5 px-2 text-xs text-ink-muted"
    />
  )
}
