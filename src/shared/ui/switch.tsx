import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'

interface SwitchRowProps {
  id: string
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}

export const SwitchRow: FC<SwitchRowProps> = ({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}) => (
  <div
    className={cn(
      'flex items-center justify-between gap-4 py-1',
      disabled && 'opacity-50',
    )}
  >
    <label htmlFor={id} className="flex flex-col gap-0.5 text-sm leading-tight">
      <span>{label}</span>
      {description && (
        <span className="text-xs text-muted-foreground">{description}</span>
      )}
    </label>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
        checked ? 'border-primary bg-primary' : 'border-input bg-muted',
        disabled && 'cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 block h-4 w-4 rounded-full bg-background shadow transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </button>
  </div>
)
