import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface ChangedFilesModeButtonProps {
  active: boolean
  label: string
  onClick: () => void
}

export const ChangedFilesModeButton: FC<ChangedFilesModeButtonProps> = ({
  active,
  label,
  onClick,
}) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className={cn(
      'h-7 rounded border px-2 text-[11px] font-medium transition-colors',
      active
        ? 'border-border bg-muted text-foreground'
        : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    )}
    onClick={onClick}
  >
    {label}
  </Button>
)
