import type { ConversationSummary } from '../../shared/studio-api'
import { studioTheme } from '../../shared/ui'
import { conversationTimestamp, statusBadge } from '../../entities/conversation'

/**
 * The list of conversations, and the seed of the Inbox (constitution law 5).
 *
 * Every row carries its state, because the thing this surface exists to
 * advertise is what awaits your eyes. Render-only: the selection lives in the
 * shell above, so this component holds no state and runs no effect.
 */
export function ConversationList(props: {
  conversations: ConversationSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}): React.JSX.Element {
  return (
    <nav
      style={{
        width: '288px',
        flexShrink: 0,
        borderRight: `1px solid ${studioTheme.border}`,
        background: studioTheme.panel,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '16px',
          borderBottom: `1px solid ${studioTheme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: '0.01em' }}>
          Conversations
        </span>
        <button
          type="button"
          onClick={props.onNew}
          style={{
            border: `1px solid ${studioTheme.border}`,
            background: studioTheme.panelRaised,
            color: studioTheme.text,
            borderRadius: studioTheme.radius,
            padding: '6px 12px',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          New
        </button>
      </div>

      {props.conversations.length === 0 ? (
        <p style={{ padding: '16px', margin: 0, color: studioTheme.textMuted }}>
          Nothing yet. Type a sentence below and something will start working on
          it.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '8px',
            overflowY: 'auto',
          }}
        >
          {props.conversations.map((conversation) => {
            const badge = statusBadge(conversation.status)
            const selected = conversation.id === props.selectedId
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => props.onSelect(conversation.id)}
                  aria-current={selected}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid transparent',
                    borderColor: selected ? studioTheme.border : 'transparent',
                    background: selected
                      ? studioTheme.panelRaised
                      : 'transparent',
                    color: studioTheme.text,
                    borderRadius: studioTheme.radius,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    font: 'inherit',
                    display: 'grid',
                    gap: '4px',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {conversation.title}
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: studioTheme.textMuted,
                      fontSize: '12px',
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
                    <span aria-hidden="true">·</span>
                    {conversationTimestamp(conversation.updatedAt)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
