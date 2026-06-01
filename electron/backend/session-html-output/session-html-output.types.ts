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

export interface SaveSessionHtmlOutputInput {
  sessionId: string
  sourceItemId?: string | null
  kind: SessionHtmlOutputKind
  relativePath?: string | null
  html: string
}

export interface RecordSessionHtmlOutputFailureInput {
  sessionId: string
  sourceItemId?: string | null
  kind: SessionHtmlOutputKind
  error: string
}

export interface RecordSessionHtmlOutputPendingInput {
  sessionId: string
  sourceItemId?: string | null
  kind: SessionHtmlOutputKind
  relativePath?: string | null
}
