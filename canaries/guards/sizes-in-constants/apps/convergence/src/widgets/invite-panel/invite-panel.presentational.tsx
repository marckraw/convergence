// The panel that wears them: one through the slice's index and an alias, one
// through a relative import and a call, a Notice by name, and a picker's
// trigger resized in place on a wrapper the drift rules don't know. The quiet
// constant and the glyph's own size inside a prop are not sizes of the part.
import { Button, Notice } from '@convergence/ui'
import { invitePeopleRowStyles } from '@/features/invite-people'
import {
  inviteNoticeClass,
  invitePickClass,
} from '../../features/invite-people/invite-row.styles'

const GLYPH = 'size-3.5'

export function InvitePanel({ people }: { people: string[] }) {
  return (
    <>
      {people.map((person) => (
        <Button key={person} className={invitePeopleRowStyles.row}>
          {person}
        </Button>
      ))}
      <Button
        icon={<span className={GLYPH} />}
        className={invitePeopleRowStyles.quiet}
      >
        Quiet
      </Button>
      <Button className={invitePickClass(true)}>Pick</Button>
      <Notice className={inviteNoticeClass} title="Nobody to invite" />
      <ModelPicker triggerClassName="w-full px-2 text-xs" />
    </>
  )
}
