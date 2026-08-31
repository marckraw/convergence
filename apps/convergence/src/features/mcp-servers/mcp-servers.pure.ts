import type { McpServerStatus } from '@/shared/types/mcp.types'

export function getMcpStatusBadgeClassName(status: McpServerStatus): string {
  switch (status) {
    case 'ready':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'needs-auth':
      return 'border-warning/20 bg-warning/10 text-warning-foreground'
    case 'failed':
      return 'border-destructive/20 bg-destructive/10 text-destructive'
    default:
      return 'border-border/70 bg-muted/50 text-muted-foreground'
  }
}
