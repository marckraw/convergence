import type { FC } from 'react'
import { TranscriptViewSwitch } from './transcript-view-switch.presentational'
import {
  useTranscriptViewMode,
  useTranscriptViewStore,
} from './transcript-view.model'

interface SessionTranscriptViewSwitchProps {
  sessionId: string
}

/**
 * The Compact/Full switch bound to one conversation's remembered choice
 * (MAR-3391 R5). Every surface that draws a transcript mounts this one, so a
 * surface that folds can never ship without the way back to Full.
 */
export const SessionTranscriptViewSwitch: FC<
  SessionTranscriptViewSwitchProps
> = ({ sessionId }) => {
  const mode = useTranscriptViewMode(sessionId)
  const setMode = useTranscriptViewStore((state) => state.setMode)
  return (
    <TranscriptViewSwitch
      mode={mode}
      onChange={(next) => setMode(sessionId, next)}
    />
  )
}
