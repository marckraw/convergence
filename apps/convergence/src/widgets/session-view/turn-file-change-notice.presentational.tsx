import type { FC } from 'react'
import { AlertTriangle, FileQuestion } from 'lucide-react'
import type { TurnFileChangeNotice } from './turn-file-change-notice.pure'

interface TurnFileChangeNoticesProps {
  notices: TurnFileChangeNotice[]
}

export const TurnFileChangeNotices: FC<TurnFileChangeNoticesProps> = ({
  notices,
}) => {
  if (notices.length === 0) return null

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-border bg-warning/5 px-3 py-2">
      {notices.map((notice) => (
        <p
          key={notice.kind}
          className="flex items-center gap-1.5 text-[11px] text-warning-foreground"
        >
          {notice.kind === 'binary' ? (
            <FileQuestion className="h-3 w-3 shrink-0" />
          ) : (
            <AlertTriangle className="h-3 w-3 shrink-0" />
          )}
          {notice.text}
        </p>
      ))}
    </div>
  )
}
