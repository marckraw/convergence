import type { ConversationSnapshot } from '../../shared/studio-api'
import { studioTheme } from '../../shared/ui'
import { statusBadge, transcriptWarnings } from '../../entities/conversation'
import { TranscriptRow } from './transcript-row.presentational'

/**
 * The raw transcript (MAR-2770).
 *
 * Raw is the point: this run has no Narrator (constitution law 3), so the
 * window shows exactly what the wire carried and says nothing the daemon did
 * not. Messages read as prose; thinking, tool calls and tool results are
 * collapsed rows a reader opens when they want them — a native `<details>`,
 * which is why this component can be render-only and still be expandable.
 */
export function Transcript(props: {
  snapshot: ConversationSnapshot | null
}): React.JSX.Element {
  const snapshot = props.snapshot
  if (!snapshot) {
    return (
      <section style={emptyStyle}>
        <h1 style={{ fontSize: '20px', margin: 0 }}>Backpack Studio</h1>
        <p style={{ color: studioTheme.textMuted, maxWidth: '46ch' }}>
          Type a sentence below. It goes to an agent that works on a machine of
          ours, and the answer comes back here.
        </p>
      </section>
    )
  }

  const badge = statusBadge(snapshot.status)
  const warnings = transcriptWarnings(snapshot)

  return (
    <section
      style={{
        flex: 1,
        minWidth: 0,
        overflowY: 'auto',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <header style={{ display: 'grid', gap: '6px' }}>
        <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 600 }}>
          {snapshot.title}
        </h1>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: studioTheme.textMuted,
            fontSize: '13px',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: badge.tone,
            }}
          />
          {badge.label}
        </span>
      </header>

      {warnings.map((warning) => (
        <p
          key={warning}
          role="status"
          style={{
            margin: 0,
            padding: '10px 12px',
            borderRadius: studioTheme.radius,
            border: `1px solid ${studioTheme.danger}55`,
            background: `${studioTheme.danger}14`,
            color: studioTheme.text,
            fontSize: '13px',
          }}
        >
          {warning}
        </p>
      ))}

      {snapshot.items.length === 0 ? (
        <p style={{ color: studioTheme.textMuted, margin: 0 }}>
          Waiting for the first word…
        </p>
      ) : (
        snapshot.items.map((item) => (
          <TranscriptRow key={item.id} item={item} />
        ))
      )}
    </section>
  )
}

const emptyStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  textAlign: 'center',
} as const
