// canary: no-ascii-ellipsis
// Words typed with three ASCII dots where R10 writes the ellipsis character: a busy label, a
// placeholder, an item that opens a dialog, and a name cut short. The spreads ({...rest},
// [...names]) are code, not words, and are not reported.
import { Button, Input } from '@convergence/ui'
import type { ComponentProps } from 'react'

type RenameSessionProps = ComponentProps<typeof Button> & { names: string[] }

export function RenameSession({ names, ...rest }: RenameSessionProps) {
  const busy = 'Regenerating session name...'
  const short = names[0].slice(0, 40) + '...'
  return (
    <div>
      <Input placeholder="Search sessions..." />
      <Button {...rest}>Rename...</Button>
      <p>{[...names, short].join(', ')}</p>
      <p>{busy}</p>
    </div>
  )
}
