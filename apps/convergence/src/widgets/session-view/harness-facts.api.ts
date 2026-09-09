export const harnessFactsApi = {
  read: (sessionId: string) =>
    window.electronAPI.session.harnessFacts(sessionId),
  subscribe: (listener: (event: { sessionId: string }) => void) =>
    window.electronAPI.session.onHarnessFacts(listener),
}
