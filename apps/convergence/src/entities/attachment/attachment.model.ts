import { create, type StoreApi } from 'zustand'
import type {
  Attachment,
  AttachmentIngestFileInput,
  AttachmentIngestRejection,
  AttachmentIngestResult,
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
  ingestFromOpenDialog: (sessionId: string) => Promise<void>
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

/**
 * One ingest, from dropped files or from the open dialog: the draft is in
 * flight, then takes the attachments and the refusals that came back, or the
 * reason the ingest failed as a refusal of its own. A dialog closed without a
 * choice brings back nothing, and the draft is simply no longer in flight.
 */
async function ingestInto(
  set: StoreApi<AttachmentStore>['setState'],
  sessionId: string,
  read: () => Promise<AttachmentIngestResult | null>,
): Promise<void> {
  set((state) =>
    withDraft(state, sessionId, (d) => ({ ...d, ingestInFlight: true })),
  )
  try {
    const result = await read()
    if (!result) {
      set((state) =>
        withDraft(state, sessionId, (d) => ({ ...d, ingestInFlight: false })),
      )
      return
    }
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

  ingestFiles: (sessionId, files) =>
    ingestInto(set, sessionId, () =>
      attachmentApi.ingestFiles(sessionId, files),
    ),

  ingestFromOpenDialog: (sessionId) =>
    ingestInto(set, sessionId, () =>
      attachmentApi.ingestFromOpenDialog(sessionId),
    ),

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
