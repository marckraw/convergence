import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/cn.pure'

interface StatusFilterButtonProps {
  active: boolean
  label: string
  count: number
  onClick: () => void
}

export const StatusFilterButton: FC<StatusFilterButtonProps> = ({
  active,
  label,
  count,
  onClick,
}) => (
  <Button
    type="button"
    variant={active ? 'secondary' : 'ghost'}
    size="sm"
    className={cn('h-7 px-2 text-xs', count === 0 && !active && 'opacity-60')}
    onClick={onClick}
  >
    {label} {count}
  </Button>
)
