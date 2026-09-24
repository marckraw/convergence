import { useEffect, useRef, useState } from 'react'
import {
  conversationActionsApi,
  type ConversationRoutineAction,
} from '@/entities/conversation-actions'

export interface ConversationRoutinesState {
  /** False until this open's first answer lands: nothing is drawn from a guess. */
  loaded: boolean
  routines: ConversationRoutineAction[]
  error: string | null
}

const CLOSED: ConversationRoutinesState = {
  loaded: false,
  routines: [],
  error: null,
}

/**
 * CA1's `conversationActions:describe`, asked on every open and, while open,
 * again whenever the conversation's status, attention or activity moves
 * (MAR-3393 R4). Nothing survives a close: the next open asks afresh.
 *
 * Every one of those facts is a value the caller already re-renders on, so
 * there is no interval; and a sequence number drops an answer that a newer
 * question has overtaken.
 */
export function useConversationRoutines(input: {
  sessionId: string
  open: boolean
  status: string
  attention: string
  activity: string | null | undefined
}): ConversationRoutinesState {
  const { sessionId, open, status, attention, activity } = input
  const [state, setState] = useState<ConversationRoutinesState>(CLOSED)
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current
    if (!open) {
      setState(CLOSED)
      return
    }
    conversationActionsApi.describe(sessionId).then(
      (routines) => {
        if (seqRef.current !== seq) return
        setState({ loaded: true, routines, error: null })
      },
      (error: unknown) => {
        if (seqRef.current !== seq) return
        setState({
          loaded: true,
          routines: [],
          error:
            error instanceof Error
              ? error.message
              : 'Could not read this conversation’s routines.',
        })
      },
    )
  }, [open, sessionId, status, attention, activity])

  return state
}
