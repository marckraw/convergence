import type { FC } from 'react'
import { Loader2 } from 'lucide-react'
import { SessionBadge } from '@/shared/ui/session-badge.presentational'

const labelMap: Record<string, string> = {
  'needs-approval': 'Needs Approval',
  'needs-input': 'Needs Input',
  finished: 'Finished',
  failed: 'Failed',
}

const pillStyleMap: Record<string, string> = {
  'needs-approval': 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
  'needs-input': 'bg-blue-500/10 text-blue-700 dark:text-blue-500',
  finished: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-500',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-500',
}

interface AttentionIndicatorProps {
  attention: string
}

export const AttentionIndicator: FC<AttentionIndicatorProps> = ({
  attention,
}) => {
  const label = labelMap[attention]
  const pillStyle = pillStyleMap[attention]

  if (!label || !pillStyle) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground [&_svg]:size-3">
        <Loader2 className="animate-spin" />
        Running
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3 ${pillStyle}`}
    >
      <SessionBadge attention={attention} />
      {label}
    </span>
  )
}
