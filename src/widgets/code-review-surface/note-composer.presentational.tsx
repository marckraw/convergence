import type { FC } from 'react'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'

interface NoteComposerProps {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}

export const NoteComposer: FC<NoteComposerProps> = ({
  label,
  value,
  placeholder,
  onChange,
  onCancel,
  onSave,
}) => (
  <div className="space-y-2 rounded-md border border-border bg-card p-2">
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="min-h-20 resize-none text-xs"
      aria-label={label}
    />
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={value.trim().length === 0}
        onClick={onSave}
      >
        Save note
      </Button>
    </div>
  </div>
)
