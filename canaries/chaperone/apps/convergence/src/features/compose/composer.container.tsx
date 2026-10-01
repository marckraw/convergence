// canary: renderer-preload-access-through-api-files, renderer-fsd-public-api-imports, renderer-fsd-lite-boundaries, no-raw-button-outside-shared, no-raw-input-outside-shared
// Reads the preload bridge outside an .api.ts, reaches into a slice past its index.ts, imports a
// widget from a feature through the @/ alias (what Chaperone 0.8.0 found in a test, MAR-3609), and
// renders a raw <button> and <input> instead of shared/ui's.
import { useSessionStore } from '@/entities/session/session.model'
import { SessionWires } from '@/widgets/session-view'

export function ComposerContainer() {
  const version = window.electronAPI.appVersion
  return (
    <form>
      <SessionWires sessionId={useSessionStore()} />
      <input name="draft" />
      <button type="submit">Send {version}</button>
    </form>
  )
}
