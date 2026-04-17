export type AttachmentKind = 'image' | 'pdf' | 'text'

export interface Attachment {
  id: string
  sessionId: string
  kind: AttachmentKind
  mimeType: string
  filename: string
  sizeBytes: number
  storagePath: string
  thumbnailPath: string | null
  textPreview: string | null
  createdAt: string
}

export interface AttachmentIngestRejection {
  filename: string
  reason: string
}

export interface AttachmentIngestResult {
  attachments: Attachment[]
  rejections: AttachmentIngestRejection[]
}

export interface AttachmentIngestFileInput {
  name: string
  bytes: Uint8Array | ArrayBuffer | number[]
  mimeType?: string
}
