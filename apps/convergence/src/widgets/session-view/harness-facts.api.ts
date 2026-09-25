export const harnessFactsApi = {
  read: (sessionId: string) =>
    window.electronAPI.session.harnessFacts(sessionId),
  subscribe: (listener: (event: { sessionId: string }) => void) =>
    window.electronAPI.session.onHarnessFacts(listener),
  /** Record the running process's MCP status; reconnect one server first when named. */
  refreshMcpServers: (sessionId: string, reconnect: string | null) =>
    window.electronAPI.session.refreshMcpServers(sessionId, reconnect),
}
