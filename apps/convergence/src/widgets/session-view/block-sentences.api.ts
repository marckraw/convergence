import type { BlockSentenceData } from '@/shared/types/electron-api'

/** The stored work-block sentences (MAR-3395 CV3), read from main. */
export const blockSentencesApi = {
  list: (sessionId: string): Promise<BlockSentenceData[]> =>
    window.electronAPI.blockSentences.list(sessionId),
  onChanged: (callback: (event: { sessionId: string }) => void) =>
    window.electronAPI.blockSentences.onChanged(callback),
}
