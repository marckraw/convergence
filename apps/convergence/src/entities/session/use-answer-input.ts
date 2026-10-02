import { useCallback } from 'react'
import { useSessionStore } from './session.model'
import type { InteractionResponse } from './session.types'

/**
 * Answers an agent's request for input in a conversation's transcript: the
 * answer goes to that session as an `answer` delivery, its words shown as
 * what was said (MAR-3618). One copy for every surface that shows a
 * transcript, so an answer is sent the same way from each. The callback
 * keeps its identity, since the transcript it is handed is a memo boundary.
 */
export function useAnswerInput() {
  const sendMessageToSession = useSessionStore((s) => s.sendMessageToSession)
  return useCallback(
    (sessionId: string, response: InteractionResponse, displayText: string) => {
      void sendMessageToSession({
        sessionId,
        text: displayText,
        deliveryMode: 'answer',
        interactionResponse: response,
      })
    },
    [sendMessageToSession],
  )
}
