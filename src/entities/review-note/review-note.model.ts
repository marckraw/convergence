import { create } from 'zustand'
import { reviewNoteApi } from './review-note.api'
import type {
  CreateReviewNoteInput,
  PreviewReviewNotePacketInput,
  ReviewNote,
  ReviewNotePacketPreview,
  UpdateReviewNoteInput,
} from './review-note.types'

interface ReviewNoteState {
  notesBySessionId: Record<string, ReviewNote[]>
  packetPreviewBySessionId: Record<string, ReviewNotePacketPreview>
  loading: boolean
  error: string | null
}

interface ReviewNoteActions {
  loadBySession: (sessionId: string) => Promise<void>
  createNote: (input: CreateReviewNoteInput) => Promise<ReviewNote | null>
  updateNote: (
    id: string,
    patch: UpdateReviewNoteInput,
  ) => Promise<ReviewNote | null>
  deleteNote: (id: string, sessionId: string) => Promise<void>
  previewPacket: (
    input: PreviewReviewNotePacketInput,
  ) => Promise<ReviewNotePacketPreview | null>
  clearError: () => void
}

export type ReviewNoteStore = ReviewNoteState & ReviewNoteActions

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next]
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export const useReviewNoteStore = create<ReviewNoteStore>((set) => ({
  notesBySessionId: {},
  packetPreviewBySessionId: {},
  loading: false,
  error: null,

  loadBySession: async (sessionId) => {
    set({ loading: true, error: null })
    try {
      const notes = await reviewNoteApi.listBySession(sessionId)
      set((state) => ({
        notesBySessionId: {
          ...state.notesBySessionId,
          [sessionId]: notes,
        },
        loading: false,
      }))
    } catch (err) {
      set({
        loading: false,
        error: errorMessage(err, 'Failed to load review notes'),
      })
    }
  },

  createNote: async (input) => {
    set({ error: null })
    try {
      const created = await reviewNoteApi.create(input)
      set((state) => ({
        notesBySessionId: {
          ...state.notesBySessionId,
          [input.sessionId]: upsertById(
            state.notesBySessionId[input.sessionId] ?? [],
            created,
          ),
        },
      }))
      return created
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to create review note') })
      return null
    }
  },

  updateNote: async (id, patch) => {
    set({ error: null })
    try {
      const updated = await reviewNoteApi.update(id, patch)
      set((state) => ({
        notesBySessionId: {
          ...state.notesBySessionId,
          [updated.sessionId]: upsertById(
            state.notesBySessionId[updated.sessionId] ?? [],
            updated,
          ),
        },
      }))
      return updated
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to update review note') })
      return null
    }
  },

  deleteNote: async (id, sessionId) => {
    set({ error: null })
    try {
      await reviewNoteApi.delete(id)
      set((state) => ({
        notesBySessionId: {
          ...state.notesBySessionId,
          [sessionId]: removeById(state.notesBySessionId[sessionId] ?? [], id),
        },
      }))
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to delete review note') })
    }
  },

  previewPacket: async (input) => {
    set({ error: null })
    try {
      const preview = await reviewNoteApi.previewPacket(input)
      set((state) => ({
        packetPreviewBySessionId: {
          ...state.packetPreviewBySessionId,
          [input.sessionId]: preview,
        },
      }))
      return preview
    } catch (err) {
      set({ error: errorMessage(err, 'Failed to preview review packet') })
      return null
    }
  },

  clearError: () => set({ error: null }),
}))
