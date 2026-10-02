// canary: no-buttons-as-rows
// The people to invite, each a Button stretched into a row: h-auto undoes the
// Button's height so a name and an email fit on two lines. A person is a
// ListRow (or, with an edge and a door, a Card with a CardAction over it).
import { Button } from '@convergence/ui'

type Person = { id: string; name: string; email: string }

export function InviteList({
  people,
  onPick,
}: {
  people: Person[]
  onPick: (id: string) => void
}) {
  return (
    <ul>
      {people.map((person) => (
        <li key={person.id}>
          <Button
            variant="ghost"
            onClick={() => onPick(person.id)}
            className="h-auto w-full flex-col items-start"
          >
            <span>{person.name}</span>
            <span>{person.email}</span>
          </Button>
        </li>
      ))}
    </ul>
  )
}
