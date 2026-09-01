import { readCapturedDaemonHandshake } from './hello-screen.pure'

/**
 * Backpack Studio's hello screen (MAR-2737).
 *
 * Render-only, and the reading is computed at render from a constant, so there
 * is no state and no effect to own — the shape this app will keep as it grows a
 * container above it.
 */
export function HelloScreen(): React.JSX.Element {
  const reading = readCapturedDaemonHandshake()

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: '3rem',
        lineHeight: 1.6,
      }}
    >
      <h1>Backpack Studio</h1>
      <p>{reading.headline}</p>
      <dl>
        <dt>Daemon version</dt>
        <dd>{reading.daemonVersion}</dd>
        <dt>API version</dt>
        <dd>{reading.apiVersion}</dd>
        <dt>Capabilities</dt>
        <dd>{reading.capabilities.join(', ')}</dd>
      </dl>
      <p>
        Read through <code>@convergence/execution-host-client</code>.
      </p>
    </main>
  )
}
