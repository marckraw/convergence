// A list of people to invite whose row is one class string written three times, none of them in a
// className or a class file: a plain const, an object's key, and a const handed on by name. The
// guard reads all three once it reads constants (DS8, DLG); a sentence held by a const ("Couldn't
// load the people to invite.") is not a class string and is never counted.
const personRow = 'grid min-w-0 grid-cols-[auto_1fr] items-center gap-3'

const inviteStyles = {
  row: 'grid min-w-0 grid-cols-[auto_1fr] items-center gap-3',
  empty: "Couldn't load the people to invite.",
}

export const invitedRow = 'items-center grid gap-3 min-w-0 grid-cols-[auto_1fr]'

export function InviteList({ people }: { people: string[] }) {
  if (people.length === 0) return <p>{inviteStyles.empty}</p>
  return (
    <ul>
      {people.map((person) => (
        <li key={person} data-row={personRow} data-styles={inviteStyles.row}>
          {person}
        </li>
      ))}
    </ul>
  )
}
