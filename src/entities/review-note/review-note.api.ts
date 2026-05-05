import type {
  CreateReviewNoteInput,
  PreviewReviewNotePacketInput,
  ReviewNote,
  ReviewNotePacketPreview,
  ReviewNotePacketSendResult,
  SendReviewNotePacketInput,
  UpdateReviewNoteInput,
} from './review-note.types'

export const reviewNoteApi = {
  listBySession: (sessionId: string): Promise<ReviewNote[]> =>
    window.electronAPI.reviewNotes.listBySession(sessionId),

  create: (input: CreateReviewNoteInput): Promise<ReviewNote> =>
    window.electronAPI.reviewNotes.create(input),

  update: (id: string, patch: UpdateReviewNoteInput): Promise<ReviewNote> =>
    window.electronAPI.reviewNotes.update(id, patch),

  delete: (id: string): Promise<void> =>
    window.electronAPI.reviewNotes.delete(id),

  previewPacket: (
    input: PreviewReviewNotePacketInput,
  ): Promise<ReviewNotePacketPreview> =>
    window.electronAPI.reviewNotes.previewPacket(input),

  sendPacket: (
    input: SendReviewNotePacketInput,
  ): Promise<ReviewNotePacketSendResult> =>
    window.electronAPI.reviewNotes.sendPacket(input),
}
