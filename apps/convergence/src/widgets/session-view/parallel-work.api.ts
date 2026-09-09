export const parallelWorkApi = {
  read: async (sessionId: string) => {
    const [runs, tasks] = await Promise.all([
      window.electronAPI.session.listAgentRuns(sessionId),
      window.electronAPI.session.listTasks(sessionId),
    ])
    return { runs, tasks }
  },
  subscribe: (listener: (event: { sessionId: string }) => void) =>
    window.electronAPI.session.onEvidenceUpdated(listener),
  stop: (sessionId: string, id: string) =>
    window.electronAPI.session.stopTask(sessionId, id),
}
