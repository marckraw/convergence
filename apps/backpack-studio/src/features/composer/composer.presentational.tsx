import { studioTheme } from '../../shared/ui'

/**
 * The composer (MAR-2770).
 *
 * One box and one send. Render-only: the draft lives in the shell above,
 * because the shell is what turns a draft into either a new conversation or a
 * follow-up, and a component that owned the text would have to know which.
 *
 * Enter sends and Shift+Enter makes a line, which is the shape everyone
 * already has in their fingers.
 */
export function Composer(props: {
  value: string
  placeholder: string
  hint: string
  canSend: boolean
  busy: boolean
  onChange: (value: string) => void
  onSend: () => void
}): React.JSX.Element {
  const sendable = props.canSend && !props.busy && props.value.trim() !== ''
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (sendable) props.onSend()
      }}
      style={{
        borderTop: `1px solid ${studioTheme.border}`,
        background: studioTheme.panel,
        padding: '14px 28px 18px',
        display: 'grid',
        gap: '8px',
      }}
    >
      {props.hint === '' ? null : (
        <p
          style={{ margin: 0, fontSize: '12px', color: studioTheme.textMuted }}
        >
          {props.hint}
        </p>
      )}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
        <textarea
          value={props.value}
          placeholder={props.placeholder}
          disabled={!props.canSend}
          rows={2}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (sendable) props.onSend()
            }
          }}
          style={{
            flex: 1,
            resize: 'none',
            borderRadius: studioTheme.radius,
            border: `1px solid ${studioTheme.border}`,
            background: studioTheme.canvas,
            color: studioTheme.text,
            padding: '10px 12px',
            font: 'inherit',
            lineHeight: 1.5,
          }}
        />
        <button
          type="submit"
          disabled={!sendable}
          style={{
            borderRadius: studioTheme.radius,
            border: `1px solid ${sendable ? studioTheme.accent : studioTheme.border}`,
            background: sendable ? studioTheme.accent : studioTheme.panelRaised,
            color: sendable ? '#08121f' : studioTheme.textMuted,
            padding: '10px 18px',
            cursor: sendable ? 'pointer' : 'not-allowed',
            font: 'inherit',
            fontWeight: 600,
          }}
        >
          {props.busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}
