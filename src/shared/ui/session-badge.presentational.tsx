import type { FC } from 'react'
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'

interface SessionBadgeProps {
  attention: string
}

export const SessionBadge: FC<SessionBadgeProps> = ({ attention }) => {
  switch (attention) {
    case 'needs-approval':
      return <AlertTriangle className="h-3 w-3 text-amber-500" />
    case 'needs-input':
      return <MessageSquare className="h-3 w-3 text-blue-500" />
    case 'finished':
      return <CheckCircle className="h-3 w-3 text-green-500" />
    case 'failed':
      return <XCircle className="h-3 w-3 text-red-500" />
    default:
      return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  }
}
