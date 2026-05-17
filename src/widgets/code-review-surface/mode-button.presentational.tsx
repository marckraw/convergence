import type { FC } from 'react'
import { Button } from '@/shared/ui/button'

interface ModeButtonProps {
  active: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}

export const ModeButton: FC<ModeButtonProps> = ({
  active,
  disabled = false,
  label,
  onClick,
}) => (
  <Button
    type="button"
    variant={active ? 'secondary' : 'ghost'}
    size="sm"
    className="h-7 px-2 text-xs"
    disabled={disabled}
    onClick={onClick}
  >
    {label}
  </Button>
)
