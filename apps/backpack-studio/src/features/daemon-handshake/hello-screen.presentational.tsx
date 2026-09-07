import type { StudioHandshakeReading } from '../../shared/api'

/**
 * Backpack Studio's hello screen (MAR-2737).
 *
 * Render-only: StudioApp supplies the same evaluated connection reading used
 * by the onboarding and home screens, including the developer fixture toggle.
 */
export function HelloScreen({
  reading,
}: {
  reading: StudioHandshakeReading
}): React.JSX.Element {
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
