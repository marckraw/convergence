import type { FC } from 'react'
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'

interface AttentionIndicatorProps {
  attention: string
}

export const AttentionIndicator: FC<AttentionIndicatorProps> = ({
  attention,
}) => {
  switch (attention) {
    case 'needs-approval':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
          <AlertTriangle className="h-3 w-3" />
          Needs Approval
        </span>
      )
    case 'needs-input':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
          <MessageSquare className="h-3 w-3" />
          Needs Input
        </span>
      )
    case 'finished':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
          <CheckCircle className="h-3 w-3" />
          Finished
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
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
