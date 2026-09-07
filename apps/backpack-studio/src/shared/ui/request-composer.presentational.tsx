import { Button } from './backpack'

export interface RequestComposerProps {
  value: string
  onChange(value: string): void
  onSend(): void
  disabled?: boolean
  hint?: string
  placeholder?: string
}

export function RequestComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  hint,
  placeholder = 'Describe what you need, or start with something you’ve saved.',
}: RequestComposerProps): React.JSX.Element {
  return (
    <form
      className="studio-composer"
      aria-label="New request"
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && value.trim()) onSend()
      }}
    >
      <textarea
        aria-label="Your request"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!disabled && value.trim()) onSend()
          }
        }}
      />
      {hint && <p className="studio-small">{hint}</p>}
      <div className="studio-composer-bottom">
        <button
          className="studio-small"
          type="button"
          aria-disabled="true"
          title="Files and skills are not available yet."
        >
          + Add a file · Choose a skill
        </button>
        <Button
          variant="filled"
          size="regular"
          type="submit"
          disabled={disabled || !value.trim()}
        >
          Send ↑
        </Button>
      </div>
    </form>
  )
}
