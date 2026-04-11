import type { FC } from 'react'
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'

interface AttentionBadgeProps {
  attention: string
}

export const AttentionBadge: FC<AttentionBadgeProps> = ({ attention }) => {
  switch (attention) {
    case 'needs-approval':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          <AlertTriangle className="h-3 w-3" />
          Needs Approval
        </span>
      )
    case 'needs-input':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
          <MessageSquare className="h-3 w-3" />
          Needs Input
        </span>
      )
    case 'finished':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          <CheckCircle className="h-3 w-3" />
          Finished
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
          <XCircle className="h-3 w-3" />
          Failed
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </span>
      )
  }
}
