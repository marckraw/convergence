import { studioTheme } from '../../shared/ui'

/**
 * The honest screen (MAR-2770).
 *
 * Studio is hardcoded to one machine by constitution law 6, which means the
 * person running it has no setting to fix and no dialog to fill in. So when a
 * variable is missing the app says which one, by name, and stops there —
 * rather than opening a window that looks working and fails at the first
 * sentence.
 *
 * The names only. A value never reaches this component, because one of the four
 * is a token.
 */
export function StartupNotice(props: {
  sentence: string
  missing: string[]
}): React.JSX.Element {
  return (
    <main
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: studioTheme.canvas,
        color: studioTheme.text,
        fontFamily: studioTheme.font,
        padding: '48px',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '20px', margin: 0 }}>Backpack Studio</h1>
      <p style={{ margin: 0, maxWidth: '52ch', color: studioTheme.textMuted }}>
        {props.sentence}
      </p>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gap: '6px',
          fontFamily: studioTheme.mono,
          fontSize: '13px',
        }}
      >
        {props.missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <p
        style={{
          margin: 0,
          maxWidth: '52ch',
          color: studioTheme.textMuted,
          fontSize: '13px',
        }}
      >
        Set them in the shell, or in a <code>.env</code> file beside the app,
        and open Studio again.
      </p>
    </main>
  )
}
