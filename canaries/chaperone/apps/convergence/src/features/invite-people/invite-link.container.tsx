// canary: no-raw-button-outside-shared
// A container that draws a raw link to the invite page instead of TextLink (DS8: the rule reads <a>
// as well as <button>). The link handed to ListRow's render prop is the part's, and a comment that
// names <a> is no element; neither is reported.
import { ListRow } from '@convergence/ui'

export function InviteLinkContainer({ href }: { href: string }) {
  // Not <a href={href}>: a comment names the element, it draws none.
  return (
    <div>
      <a href={href}>Open the invite page</a>
      <ListRow title="Invites" render={<a href={href} />} />
    </div>
  )
}
