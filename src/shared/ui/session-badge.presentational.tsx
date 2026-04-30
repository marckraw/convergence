import type { FC } from 'react'
import {
  Loader2,
  CheckCircle2,
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
      return <AlertTriangle className="shrink-0 text-warning" />
    case 'needs-input':
      return <MessageSquare className="shrink-0 text-blue-500" />
    case 'finished':
      return <CheckCircle2 className="shrink-0 text-emerald-500" />
    case 'failed':
      return <XCircle className="shrink-0 text-red-500" />
    default:
      return <Loader2 className="shrink-0 animate-spin text-muted-foreground" />
  }
}
