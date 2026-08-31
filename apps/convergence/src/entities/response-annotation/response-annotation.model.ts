import { create } from 'zustand'
import type {
  ResponseAnnotation,
  ResponseAnnotationDraft,
} from './response-annotation.types'

/**
 * The pending set, per session (RA1).
 *
 * Zustand rather than component state because annotations cross UI trees:
 * they are created in the transcript and consumed by the composer, which have
 * no common ancestor short of the widget that renders both. That crossing is
 * the one axis the existing skill-selection chips do not have, and it is why
 * this is a store instead of a `useState` in the composer.
 *
 * Keyed by session because a pending annotation belongs to the conversation it
 * quotes; switching sessions must not carry it along.
 */

interface ResponseAnnotationState {
  annotationsBySessionId: Record<string, ResponseAnnotation[]>
}

interface ResponseAnnotationActions {
  /** Returns the stored annotation so a caller can immediately act on it. */
  addAnnotation: (
    sessionId: string,
    draft: ResponseAnnotationDraft,
  ) => ResponseAnnotation
  editAnnotation: (
    sessionId: string,
    annotationId: string,
    body: string,
  ) => void
  removeAnnotation: (sessionId: string, annotationId: string) => void
  /** After a successful send: kept, not deleted — the tray reads pending only. */
  markPendingAsSent: (sessionId: string) => void
  clearAnnotations: (sessionId: string) => void
}

export type ResponseAnnotationStore = ResponseAnnotationState &
  ResponseAnnotationActions

/** One shared identity for "this session has nothing", so selecting it is stable. */
const EMPTY_ANNOTATIONS: ResponseAnnotation[] = []

export const useResponseAnnotationStore = create<ResponseAnnotationStore>(
  (set) => ({
    annotationsBySessionId: {},

    addAnnotation: (sessionId, draft) => {
      const annotation: ResponseAnnotation = {
        ...draft,
        id: crypto.randomUUID(),
        state: 'pending',
        createdAt: new Date().toISOString(),
      }

      set((state) => ({
        annotationsBySessionId: {
          ...state.annotationsBySessionId,
          [sessionId]: [
            ...(state.annotationsBySessionId[sessionId] ?? []),
            annotation,
          ],
        },
      }))

      return annotation
    },

    editAnnotation: (sessionId, annotationId, body) => {
      set((state) => {
        const current = state.annotationsBySessionId[sessionId]
        if (!current) return state

        return {
          annotationsBySessionId: {
            ...state.annotationsBySessionId,
            [sessionId]: current.map((annotation) =>
              // Only a pending annotation is still the user's to change; one
              // already sent is a record of what the model was told.
              annotation.id === annotationId && annotation.state === 'pending'
                ? { ...annotation, body }
                : annotation,
            ),
          },
        }
      })
    },

    removeAnnotation: (sessionId, annotationId) => {
      set((state) => {
        const current = state.annotationsBySessionId[sessionId]
        if (!current) return state

        return {
          annotationsBySessionId: {
            ...state.annotationsBySessionId,
            [sessionId]: current.filter(
              (annotation) => annotation.id !== annotationId,
            ),
          },
        }
      })
    },

    markPendingAsSent: (sessionId) => {
      set((state) => {
        const current = state.annotationsBySessionId[sessionId]
        if (!current) return state

        return {
          annotationsBySessionId: {
            ...state.annotationsBySessionId,
            [sessionId]: current.map((annotation) =>
              annotation.state === 'pending'
                ? { ...annotation, state: 'sent' }
                : annotation,
            ),
          },
        }
      })
    },

    clearAnnotations: (sessionId) => {
      set((state) => {
        if (!state.annotationsBySessionId[sessionId]) return state

        const next = { ...state.annotationsBySessionId }
        delete next[sessionId]
        return { annotationsBySessionId: next }
      })
    },
  }),
)

/**
 * A session's annotations by stable reference — the array in the store, not a
 * derived copy, so subscribing components re-render only when it actually
 * changes. Filtering belongs in a `useMemo` over this, via the pure selectors.
 */
export function useSessionAnnotations(
  sessionId: string | null,
): ResponseAnnotation[] {
  return useResponseAnnotationStore((state) =>
    sessionId
      ? (state.annotationsBySessionId[sessionId] ?? EMPTY_ANNOTATIONS)
      : EMPTY_ANNOTATIONS,
  )
}
