import type { FC } from 'react'
import type { TranscriptEntry } from '@/entities/session'

interface TranscriptPreviewProps {
  entry: TranscriptEntry
}

export const TranscriptPreview: FC<TranscriptPreviewProps> = ({ entry }) => {
  switch (entry.type) {
    case 'user':
      return (
        <p className="text-sm">
          <span className="font-medium text-blue-600">You:</span> {entry.text}
        </p>
      )
    case 'assistant':
      return (
        <p className="text-sm">
          <span className="font-medium text-purple-600">Agent:</span>{' '}
          {entry.text}
        </p>
      )
    case 'approval-request':
      return (
        <p className="text-sm text-amber-700">
          Approval requested: {entry.description}
        </p>
      )
    case 'tool-use':
      return (
        <p className="text-sm text-muted-foreground">
          Tool: {entry.tool} → {entry.input}
        </p>
      )
    case 'tool-result':
      return (
        <p className="text-sm text-muted-foreground">Result: {entry.result}</p>
      )
    case 'system':
      return (
        <p className="text-sm italic text-muted-foreground">{entry.text}</p>
      )
    default:
      return null
  }
}
