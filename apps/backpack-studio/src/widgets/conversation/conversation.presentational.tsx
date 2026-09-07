import { HomeNav, type HomeNavProps } from '../../features/home'
import { transcriptWarnings } from '../../entities/conversation'
import type { ConversationSnapshot } from '../../shared/api'
import { RequestComposer, type RequestComposerProps } from '../../shared/ui'

export function ConversationView({
  nav,
  snapshot,
  composer,
}: {
  nav: HomeNavProps
  snapshot: ConversationSnapshot | null
  composer: RequestComposerProps
}): React.JSX.Element {
  return (
    <div className="studio-home studio-conversation">
      <HomeNav {...nav} />
      <div className="studio-home-main">
        <header className="studio-topbar">
          <button type="button" onClick={nav.onNew}>
            Back to home
          </button>
          <span>{snapshot?.title ?? 'Loading conversation…'}</span>
        </header>
        <main className="studio-conversation-body">
          {snapshot && (
            <>
              <p role="status">
                {snapshot.status === 'running'
                  ? 'Working…'
                  : snapshot.status === 'failed'
                    ? 'This request was refused.'
                    : 'Ready for your next message.'}
              </p>
              {transcriptWarnings(snapshot).map((warning) => (
                <p role="alert" key={warning}>
                  {warning}
                </p>
              ))}
              <section
                className="studio-transcript"
                aria-label="Conversation transcript"
              >
                {snapshot.items.map((row) => (
                  <article
                    className="studio-transcript-row"
                    key={row.id}
                    data-kind={row.kind}
                  >
                    {row.kind === 'message' ? (
                      <>
                        <h2 className="studio-section-title">
                          {row.actor === 'user' ? 'You' : 'Assistant'}
                        </h2>
                        <p>{row.text}</p>
                      </>
                    ) : (
                      <details>
                        <summary>
                          {row.label} · {row.kind}
                        </summary>
                        <pre>{row.text}</pre>
                      </details>
                    )}
                    {row.state === 'error' && (
                      <p>Could not complete this item.</p>
                    )}
                  </article>
                ))}
              </section>
            </>
          )}
          <RequestComposer {...composer} />
        </main>
      </div>
    </div>
  )
}
