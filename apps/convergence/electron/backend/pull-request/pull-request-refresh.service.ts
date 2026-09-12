import type { PullRequestService } from './pull-request.service'
import type { SessionSettledListener } from '../session/session.types'

interface RefreshEvents {
  onSessionSettled(listener: SessionSettledListener): () => void
  onPullRequestHint(listener: (sessionId: string) => void): () => void
}

/** Observer: PR refreshes consume session events without owning session lifecycle. */
export function connectPullRequestRefresh(
  service: PullRequestService,
  events: RefreshEvents,
  onChanged: (id: string) => void,
  onQuit: (dispose: () => void) => void = () => {},
): () => void {
  const refresh = (sessionId: string) => {
    void service.refreshForSession(sessionId).catch((error) => {
      console.error(`[pull-request] refresh failed for ${sessionId}`, error)
    })
  }
  const off = events.onSessionSettled(({ sessionId }) => refresh(sessionId))
  const offHint = events.onPullRequestHint(refresh)
  service.start(onChanged)
  const dispose = () => {
    off()
    offHint()
    service.stop()
  }
  onQuit(dispose)
  return dispose
}
