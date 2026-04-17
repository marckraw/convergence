import type {
  Attachment,
  AttachmentIngestFileInput,
  AttachmentIngestResult,
} from './attachment.types'

export const attachmentApi = {
  ingestFiles: (
    sessionId: string,
    files: AttachmentIngestFileInput[],
  ): Promise<AttachmentIngestResult> =>
    window.electronAPI.attachments.ingestFiles(sessionId, files),

  ingestFromPaths: (
    sessionId: string,
    paths: string[],
  ): Promise<AttachmentIngestResult> =>
    window.electronAPI.attachments.ingestFromPaths(sessionId, paths),

  getForSession: (sessionId: string): Promise<Attachment[]> =>
    window.electronAPI.attachments.getForSession(sessionId),

  getById: (id: string): Promise<Attachment | null> =>
    window.electronAPI.attachments.getById(id),

  readBytes: (id: string): Promise<Uint8Array> =>
    window.electronAPI.attachments.readBytes(id),

  delete: (id: string): Promise<void> =>
    window.electronAPI.attachments.delete(id),

  showOpenDialog: (): Promise<string[] | null> =>
    window.electronAPI.attachments.showOpenDialog(),
}
