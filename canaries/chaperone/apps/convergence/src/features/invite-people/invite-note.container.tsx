// canary: no-raw-input-outside-shared
// A container that types the invite's note in a raw <textarea> instead of Textarea (DS8).
export function InviteNoteContainer({ note }: { note: string }) {
  return <textarea aria-label="Note" defaultValue={note} />
}
