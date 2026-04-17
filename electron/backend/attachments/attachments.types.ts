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

export interface ProviderAttachmentCapability {
  supportsImage: boolean
  supportsPdf: boolean
  supportsText: boolean
  maxImageBytes: number
  maxPdfBytes: number
  maxTextBytes: number
  maxTotalBytes: number
}

export interface IngestFileInput {
  name: string
  bytes: Uint8Array
  mimeType?: string
}

export interface IngestRejection {
  filename: string
  reason: string
}

export interface IngestResult {
  attachments: Attachment[]
  rejections: IngestRejection[]
}
