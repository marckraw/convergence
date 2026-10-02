// canary: no-native-title
// A heatmap from before R2 reached every element: a cell names itself in the browser's hint
// (title= on a div) and a glyph in an SVG <title>, both slow, unstyled and never shown on focus.
// The EmptyState's title prop is its words and an empty title="" is no hint, so neither of those
// is reported.
import { EmptyState } from '@convergence/ui'

export function InviteHeatmap({ days }: { days: string[] }) {
  if (days.length === 0) return <EmptyState title="No invites yet" />
  return (
    <div>
      {days.map((day) => (
        <div key={day} className="aspect-square" title={`${day}: invited`} />
      ))}
      <svg aria-hidden viewBox="0 0 16 16">
        <title>Invited</title>
        <path d="M0 0h16v16H0z" />
      </svg>
      <img alt="" src="avatar.png" title="" />
    </div>
  )
}
