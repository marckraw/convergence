import type { SessionHtmlOutput } from './session-html-output.types'

export const sessionHtmlOutputApi = {
  list: (sessionId: string): Promise<SessionHtmlOutput[]> =>
    window.electronAPI.sessionHtmlOutputs.list(sessionId),

  readHtml: (id: string): Promise<string> =>
    window.electronAPI.sessionHtmlOutputs.readHtml(id),

  openInBrowser: (id: string): Promise<void> =>
    window.electronAPI.sessionHtmlOutputs.openInBrowser(id),
}
