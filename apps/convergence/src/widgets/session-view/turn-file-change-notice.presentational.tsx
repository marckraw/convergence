import type { FC } from 'react'
import { AlertTriangle, FileQuestion } from 'lucide-react'
import { Notice } from '@convergence/ui'
import type { TurnFileChangeNotice } from './turn-file-change-notice.pure'

interface TurnFileChangeNoticesProps {
  notices: TurnFileChangeNotice[]
}

/**
 * What a stored diff can't say about itself, above it: a warning Notice per
 * fact (DS-5), in the strip the diff viewer starts under.
 */
export const TurnFileChangeNotices: FC<TurnFileChangeNoticesProps> = ({
  notices,
}) => {
  if (notices.length === 0) return null

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-line px-3 py-2">
      {notices.map((notice) => (
        <Notice
          key={notice.kind}
          tone="warning"
          icon={notice.kind === 'binary' ? <FileQuestion /> : <AlertTriangle />}
          title={notice.text}
          size="xs"
        />
      ))}
    </div>
  )
}
