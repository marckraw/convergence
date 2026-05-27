import type { FC } from 'react'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'

interface SessionBadgeProps {
  attention: string
  className?: string
}

export const SessionBadge: FC<SessionBadgeProps> = ({
  attention,
  className,
}) => {
  const iconClassName = cn('h-3 w-3 shrink-0', className)

  switch (attention) {
    case 'needs-approval':
      return <AlertTriangle className={cn(iconClassName, 'text-warning')} />
    case 'needs-input':
      return <MessageSquare className={cn(iconClassName, 'text-blue-500')} />
    case 'finished':
      return <CheckCircle2 className={cn(iconClassName, 'text-emerald-500')} />
    case 'failed':
      return <XCircle className={cn(iconClassName, 'text-red-500')} />
    default:
      return (
        <Loader2
          className={cn(iconClassName, 'animate-spin text-muted-foreground')}
        />
      )
  }
}
