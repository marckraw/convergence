import { create } from 'zustand'
import type {
  Attachment,
  AttachmentIngestFileInput,
  AttachmentIngestRejection,
} from './attachment.types'
import { attachmentApi } from './attachment.api'

export interface DraftAttachments {
  items: Attachment[]
  rejections: AttachmentIngestRejection[]
  ingestInFlight: boolean
}

interface AttachmentState {
  drafts: Record<string, DraftAttachments>
  resolved: Record<string, Record<string, Attachment>>
}

interface AttachmentActions {
  ingestFiles: (
    sessionId: string,
    files: AttachmentIngestFileInput[],
  ) => Promise<void>
  ingestFromPaths: (sessionId: string, paths: string[]) => Promise<void>
  removeDraft: (sessionId: string, attachmentId: string) => Promise<void>
  clearDraft: (sessionId: string) => void
  clearRejections: (sessionId: string) => void
  getDraft: (sessionId: string) => DraftAttachments
  hydrateForSession: (sessionId: string, items: Attachment[]) => void
  getResolvedAttachment: (
    sessionId: string,
    attachmentId: string,
  ) => Attachment | undefined
}

export type AttachmentStore = AttachmentState & AttachmentActions

const EMPTY_DRAFT: DraftAttachments = {
  items: [],
  rejections: [],
  ingestInFlight: false,
}

function draftFor(state: AttachmentState, sessionId: string): DraftAttachments {
  return state.drafts[sessionId] ?? EMPTY_DRAFT
}

function withDraft(
  state: AttachmentState,
  sessionId: string,
  updater: (draft: DraftAttachments) => DraftAttachments,
): AttachmentState {
  const current = draftFor(state, sessionId)
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [sessionId]: updater(current),
    },
  }
}

function withResolvedAdded(
  state: AttachmentState,
  sessionId: string,
  items: Attachment[],
): AttachmentState {
  if (items.length === 0) return state
  const sessionMap = state.resolved[sessionId] ?? {}
  const next = { ...sessionMap }
  for (const item of items) {
    next[item.id] = item
  }
  return {
    ...state,
    resolved: {
      ...state.resolved,
      [sessionId]: next,
    },
  }
}

export const useAttachmentStore = create<AttachmentStore>((set, get) => ({
  drafts: {},
  resolved: {},

  getDraft: (sessionId) => draftFor(get(), sessionId),

  getResolvedAttachment: (sessionId, attachmentId) =>
    get().resolved[sessionId]?.[attachmentId],

  hydrateForSession: (sessionId, items) => {
    set((state) => {
      const next: Record<string, Attachment> = {}
      for (const item of items) {
        next[item.id] = item
      }
      return {
        ...state,
        resolved: { ...state.resolved, [sessionId]: next },
      }
    })
  },

  ingestFiles: async (sessionId, files) => {
    set((state) =>
      withDraft(state, sessionId, (d) => ({ ...d, ingestInFlight: true })),
    )
    try {
      const result = await attachmentApi.ingestFiles(sessionId, files)
      set((state) => {
        const withDraftUpdate = withDraft(state, sessionId, (d) => ({
          items: [...d.items, ...result.attachments],
          rejections: [...d.rejections, ...result.rejections],
          ingestInFlight: false,
        }))
        return withResolvedAdded(withDraftUpdate, sessionId, result.attachments)
      })
    } catch (err) {
      set((state) =>
        withDraft(state, sessionId, (d) => ({
          ...d,
          ingestInFlight: false,
          rejections: [
            ...d.rejections,
            {
              filename: 'ingest',
              reason: err instanceof Error ? err.message : String(err),
            },
          ],
        })),
      )
    }
  },

  ingestFromPaths: async (sessionId, paths) => {
    set((state) =>
      withDraft(state, sessionId, (d) => ({ ...d, ingestInFlight: true })),
    )
    try {
      const result = await attachmentApi.ingestFromPaths(sessionId, paths)
      set((state) => {
        const withDraftUpdate = withDraft(state, sessionId, (d) => ({
          items: [...d.items, ...result.attachments],
          rejections: [...d.rejections, ...result.rejections],
          ingestInFlight: false,
        }))
        return withResolvedAdded(withDraftUpdate, sessionId, result.attachments)
      })
    } catch (err) {
      set((state) =>
        withDraft(state, sessionId, (d) => ({
          ...d,
          ingestInFlight: false,
          rejections: [
            ...d.rejections,
            {
              filename: 'ingest',
              reason: err instanceof Error ? err.message : String(err),
            },
          ],
        })),
      )
    }
  },

  removeDraft: async (sessionId, attachmentId) => {
    set((state) =>
      withDraft(state, sessionId, (d) => ({
        ...d,
        items: d.items.filter((a) => a.id !== attachmentId),
      })),
    )
    try {
      await attachmentApi.delete(attachmentId)
    } catch {
      // best-effort — backend cascade will clean up on session delete
    }
  },

  clearDraft: (sessionId) => {
    set((state) => ({
      ...state,
      drafts: { ...state.drafts, [sessionId]: EMPTY_DRAFT },
    }))
  },

  clearRejections: (sessionId) => {
    set((state) =>
      withDraft(state, sessionId, (d) => ({ ...d, rejections: [] })),
    )
  },
}))
