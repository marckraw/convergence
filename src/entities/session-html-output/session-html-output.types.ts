export type SessionHtmlOutputKind = 'living' | 'snapshot'

export type SessionHtmlOutputStatus = 'pending' | 'ready' | 'failed'

export interface SessionHtmlOutput {
  id: string
  sessionId: string
  sourceItemId: string | null
  kind: SessionHtmlOutputKind
  status: SessionHtmlOutputStatus
  relativePath: string | null
  sizeBytes: number
  error: string | null
  createdAt: string
  updatedAt: string
}
