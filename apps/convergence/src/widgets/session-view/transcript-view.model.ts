import { create } from 'zustand'
import {
  loadTranscriptViewMode,
  saveTranscriptViewMode,
  type TranscriptViewMode,
} from './transcript-view-mode.api'

interface TranscriptViewState {
  /** Per conversation, read from storage the first time it is asked for. */
  modes: Record<string, TranscriptViewMode>
  /** Which work blocks are open, by the block's first member id (R3). */
  openBlocks: ReadonlySet<string>
  setMode: (sessionId: string, mode: TranscriptViewMode) => void
  toggleBlock: (blockId: string) => void
  openBlock: (blockId: string) => void
}

/**
 * The transcript's view state lives OUTSIDE its rows (MAR-3391 R3): a row the
 * virtualizer unmounts and mounts again reads the same open set, and the
 * header's Compact/Full switch and the transcript read the same mode.
 */
export const useTranscriptViewStore = create<TranscriptViewState>((set) => ({
  modes: {},
  openBlocks: new Set(),
  setMode: (sessionId, mode) => {
    saveTranscriptViewMode(sessionId, mode)
    set((state) => ({ modes: { ...state.modes, [sessionId]: mode } }))
  },
  toggleBlock: (blockId) =>
    set((state) => {
      const next = new Set(state.openBlocks)
      if (next.has(blockId)) next.delete(blockId)
      else next.add(blockId)
      return { openBlocks: next }
    }),
  openBlock: (blockId) =>
    set((state) =>
      state.openBlocks.has(blockId)
        ? state
        : { openBlocks: new Set([...state.openBlocks, blockId]) },
    ),
}))

export function useTranscriptViewMode(sessionId: string): TranscriptViewMode {
  return useTranscriptViewStore(
    (state) => state.modes[sessionId] ?? loadTranscriptViewMode(sessionId),
  )
}
