import { useEffect, useState } from 'react'
import { blockSentencesApi } from './block-sentences.api'
import {
  indexBlockSentences,
  type BlockSentenceIndex,
} from './work-block-sentence.pure'

const EMPTY: BlockSentenceIndex = new Map()

/**
 * A session's stored work-block sentences, re-read whenever main says they
 * changed (MAR-3395 R4). A failed read or a missing bridge shows no
 * sentences: blocks keep their facts, exactly as without the feature.
 */
export function useBlockSentences(sessionId: string): BlockSentenceIndex {
  const [state, setState] = useState<{
    sessionId: string
    index: BlockSentenceIndex
  } | null>(null)

  useEffect(() => {
    let active = true
    let revision = 0
    const read = async () => {
      const current = ++revision
      try {
        const rows = await blockSentencesApi.list(sessionId)
        if (active && current === revision)
          setState({ sessionId, index: indexBlockSentences(rows) })
      } catch {
        // Facts only.
      }
    }
    void read()
    let unsubscribe = () => {}
    try {
      unsubscribe = blockSentencesApi.onChanged((event) => {
        if (event.sessionId === sessionId) void read()
      })
    } catch {
      // No bridge: the transcript folds exactly as without sentences.
    }
    return () => {
      active = false
      unsubscribe()
    }
  }, [sessionId])

  return state?.sessionId === sessionId ? state.index : EMPTY
}
