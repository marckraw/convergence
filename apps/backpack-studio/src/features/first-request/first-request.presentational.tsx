import type { ConnectionReading } from '../../shared/api'
import {
  Button,
  StoryPanel,
  RequestComposer,
  type RequestComposerProps,
  type StudioIdentity,
} from '../../shared/ui'

const STARTING_POINTS = [
  ['Create and design', 'Turn a brief or a Figma frame into a first draft.'],
  ['Investigate and build', 'Find a problem, explore a fix, review the work.'],
  ['Plan and organize', 'Make sense of tickets, priorities and decisions.'],
]

interface FirstRequestProps {
  identity: StudioIdentity
  connection: ConnectionReading
  onSkip: () => void
  onStart(text: string): void
  composer: RequestComposerProps
}

export function FirstRequest({
  identity,
  connection,
  onSkip,
  onStart,
  composer,
}: FirstRequestProps): React.JSX.Element {
  const connected = connection.status === 'connected'
  return (
    <main className="studio-onboarding">
      <StoryPanel />
      <section className="studio-panel" aria-labelledby="first-request-title">
        <h1 id="first-request-title">
          Welcome, {identity.name.split(' ')[0]}.
        </h1>
        <p
          className={`studio-small ${connected ? 'studio-connection-connected' : ''}`}
          role="status"
        >
          {connected ? '● Connected to' : '○ Not connected to'}{' '}
          {connection.endpointName}
        </p>
        <h2 className="studio-section-title">What would be useful today?</h2>
        {STARTING_POINTS.map(([title, description]) => (
          <button
            className="studio-request-card"
            key={title}
            type="button"
            disabled={composer.disabled}
            onClick={() => onStart(`${title}: ${description}`)}
          >
            <h3 className="studio-section-title">{title}</h3>
            <p>{description}</p>
          </button>
        ))}
        <RequestComposer {...composer} />
        <Button variant="filled" size="regular" onClick={onSkip}>
          Skip and start a conversation
        </Button>
        <p className="studio-small">
          These are starting points. You can ask for anything GCS tools support.
        </p>
      </section>
    </main>
  )
}
