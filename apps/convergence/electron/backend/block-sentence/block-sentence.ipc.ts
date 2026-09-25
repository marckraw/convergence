import { BrowserWindow, ipcMain } from 'electron'
import type { BlockSentenceRepository } from './block-sentence.repository'
import type { BlockSentencesChangedEvent } from './block-sentence.types'

export const BLOCK_SENTENCES_CHANGED_CHANNEL = 'blockSentences:changed'

/** Every window re-reads a session's sentences when they change (R4). */
export function broadcastBlockSentencesChanged(sessionId: string): void {
  const event: BlockSentencesChangedEvent = { sessionId }
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed())
      window.webContents.send(BLOCK_SENTENCES_CHANGED_CHANNEL, event)
  }
}

export function registerBlockSentenceIpcHandlers(input: {
  repository: Pick<BlockSentenceRepository, 'list'>
}): void {
  ipcMain.handle('blockSentences:list', (_event, sessionId: unknown) =>
    typeof sessionId === 'string' ? input.repository.list(sessionId) : [],
  )
}
