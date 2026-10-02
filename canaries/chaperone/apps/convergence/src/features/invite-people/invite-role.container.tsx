// canary: no-raw-input-outside-shared
// A container that picks the invitee's role in a raw <select> instead of Select (DS8).
export function InviteRoleContainer() {
  return (
    <select aria-label="Role" defaultValue="member">
      <option value="member">Member</option>
      <option value="admin">Admin</option>
    </select>
  )
}
