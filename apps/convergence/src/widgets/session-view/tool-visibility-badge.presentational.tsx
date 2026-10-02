import type { FC } from 'react'
import { Badge, Tooltip } from '@convergence/ui'

interface ToolVisibilityBadgeProps {
  label: string | null
  title: string | null
}

/** How a tool call was seen (post-run telemetry…), its explanation in our Tooltip (R2). */
export const ToolVisibilityBadge: FC<ToolVisibilityBadgeProps> = ({
  label,
  title,
}) => {
  if (!label) return null

  return (
    <Tooltip label={title ?? undefined}>
      <Badge
        className="font-medium tracking-eyebrow uppercase"
        data-testid="tool-visibility-badge"
      >
        {label}
      </Badge>
    </Tooltip>
  )
}
