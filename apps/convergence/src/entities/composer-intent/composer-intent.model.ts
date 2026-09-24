import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import type {
  ComposerIntent,
  ComposerIntentDraft,
} from './composer-intent.types'

/**
 * Pending composer intents, per session (MAR-3393).
 *
 * A store rather than a prop for the same reason Response Annotations are one
 * (`response-annotation.model.ts`): the Actions menu and the composer are
 * siblings under the conversation widget, with no common owner of the chip
 * state. A prop would also have to cross the composer's memo comparator; a
 * store read through a hook does not.
 *
 * Keyed by session so an intent posted for one conversation can never be
 * consumed by the composer of another.
 */
interface ComposerIntentState {
  intentsBySessionId: Record<string, ComposerIntent[]>
}

interface ComposerIntentActions {
  post: (sessionId: string, intent: ComposerIntentDraft) => void
  /** Removes and returns everything pending for this session, in order. */
  take: (sessionId: string) => ComposerIntent[]
}

export type ComposerIntentStore = ComposerIntentState & ComposerIntentActions

const NO_INTENTS: ComposerIntent[] = []
let intentSeq = 0

export const useComposerIntentStore = create<ComposerIntentStore>(
  (set, get) => ({
    intentsBySessionId: {},
    post: (sessionId, intent) => {
      const stamped = { ...intent, id: ++intentSeq } as ComposerIntent
      set((state) => ({
        intentsBySessionId: {
          ...state.intentsBySessionId,
          [sessionId]: [
            ...(state.intentsBySessionId[sessionId] ?? NO_INTENTS),
            stamped,
          ],
        },
      }))
    },
    take: (sessionId) => {
      const pending = get().intentsBySessionId[sessionId] ?? NO_INTENTS
      if (pending.length === 0) return NO_INTENTS
      set((state) => {
        const next = { ...state.intentsBySessionId }
        delete next[sessionId]
        return { intentsBySessionId: next }
      })
      return pending
    },
  }),
)

export function postComposerIntent(
  sessionId: string,
  intent: ComposerIntentDraft,
): void {
  useComposerIntentStore.getState().post(sessionId, intent)
}

/**
 * The composer's side: drain this session's intents as they arrive and hand
 * each to `onIntent`, once.
 *
 * `onIntent` is read through a ref so a composer that re-creates its handler
 * on every render does not re-subscribe; the drain runs whenever the pending
 * list for this session changes identity.
 */
export function useComposerIntents(
  sessionId: string | null,
  onIntent: (intent: ComposerIntent) => void,
): void {
  const pending = useComposerIntentStore((state) =>
    sessionId
      ? (state.intentsBySessionId[sessionId] ?? NO_INTENTS)
      : NO_INTENTS,
  )
  const handlerRef = useRef(onIntent)
  // Declared before the drain, so it has run by the time the drain reads it.
  useEffect(() => {
    handlerRef.current = onIntent
  })
  useEffect(() => {
    if (!sessionId || pending.length === 0) return
    for (const intent of useComposerIntentStore.getState().take(sessionId)) {
      handlerRef.current(intent)
    }
  }, [pending, sessionId])
}
