import type { TranscriptItem } from '../../shared/studio-api'
import { studioTheme } from '../../shared/ui'

/**
 * One row. A message is prose; everything else is a collapsed disclosure, so
 * the machinery is present and readable without drowning the conversation.
 */
export function TranscriptRow(props: {
  item: TranscriptItem
}): React.JSX.Element {
  const item = props.item
  if (item.kind === 'message') {
    const fromPerson = item.actor === 'user'
    return (
      <article
        style={{
          alignSelf: fromPerson ? 'flex-end' : 'flex-start',
          maxWidth: '72ch',
          padding: '12px 14px',
          borderRadius: studioTheme.radius,
          border: `1px solid ${studioTheme.border}`,
          background: fromPerson ? studioTheme.panelRaised : studioTheme.panel,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <p
          style={{
            margin: '0 0 6px',
            fontSize: '12px',
            color: studioTheme.textMuted,
          }}
        >
          {item.label}
          {item.state === 'streaming' ? ' · writing…' : ''}
          {item.state === 'error' ? ' · failed' : ''}
        </p>
        {item.text}
      </article>
    )
  }

  return (
    <details
      style={{
        border: `1px solid ${studioTheme.border}`,
        borderRadius: studioTheme.radius,
        background: studioTheme.panel,
        padding: '8px 12px',
        maxWidth: '72ch',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          color: studioTheme.textMuted,
          fontSize: '13px',
        }}
      >
        {item.label}
      </summary>
      <pre
        style={{
          margin: '8px 0 0',
          fontFamily: studioTheme.mono,
          fontSize: '12px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: studioTheme.text,
        }}
      >
        {item.text}
      </pre>
    </details>
  )
}
