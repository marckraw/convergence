import type { FC } from 'react'

interface ToolVisibilityBadgeProps {
  label: string | null
  title: string | null
}

export const ToolVisibilityBadge: FC<ToolVisibilityBadgeProps> = ({
  label,
  title,
}) => {
  if (!label) return null

  return (
    <span
      className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      title={title ?? undefined}
      data-testid="tool-visibility-badge"
    >
      {label}
    </span>
  )
}
