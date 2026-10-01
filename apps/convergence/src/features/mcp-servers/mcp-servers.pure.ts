import type { Tone } from '@convergence/ui'
import type { McpServerStatus } from '@/shared/types/mcp.types'

/** What a server's status says, as one of the five tones (R1). */
export function mcpStatusTone(status: McpServerStatus): Tone {
  switch (status) {
    case 'ready':
      return 'success'
    case 'needs-auth':
      return 'warning'
    case 'failed':
      return 'danger'
    default:
      return 'neutral'
  }
}
