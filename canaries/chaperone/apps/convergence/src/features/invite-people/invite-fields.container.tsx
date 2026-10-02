// canary: use-part-sizes
// A dense invite form from before ruling 10: a Notice, a Badge and four fields resized by a text
// size or a padding typed in className, where Notice and Badge take size and a field takes its size
// and density="compact". A margin, a width, a colour, and a Notice that ends inside an expression
// (`{error && <Notice … />}`) before a text size on another element are not reported.
import {
  Badge,
  Combobox,
  Input,
  Notice,
  SelectTrigger,
  Textarea,
} from '@convergence/ui'

export function InviteFields({ error }: { error: string | null }) {
  return (
    <div className="space-y-2">
      <Notice tone="warning" title="Invites expire in a day" className="text-xs" />
      <Badge shape="label" className="text-2xs">
        Pending
      </Badge>
      <Input aria-label="Email" className="px-2 text-xs" />
      <Textarea aria-label="Note" className="min-h-20 text-2xs" />
      <SelectTrigger aria-label="Role" className="w-40 text-xs" />
      <Combobox value="Team" items={[]} onChange={() => undefined} className="px-2" />
      <Notice title="Sent" className="mt-4 text-ink" />
      {error && <Notice tone="danger" title={error} />}
      <p className="text-xs">Invites go out by email.</p>
    </div>
  )
}
