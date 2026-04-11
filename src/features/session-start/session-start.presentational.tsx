import type { FC } from 'react'
import type { ProviderInfo } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Play } from 'lucide-react'

interface SessionStartFormProps {
  name: string
  message: string
  providers: ProviderInfo[]
  selectedProviderId: string
  onNameChange: (value: string) => void
  onMessageChange: (value: string) => void
  onProviderChange: (id: string) => void
  onSubmit: () => void
}

export const SessionStartForm: FC<SessionStartFormProps> = ({
  name,
  message,
  providers,
  selectedProviderId,
  onNameChange,
  onMessageChange,
  onProviderChange,
  onSubmit,
}) => (
  <form
    onSubmit={(e) => {
      e.preventDefault()
      onSubmit()
    }}
    className="space-y-2"
  >
    <div className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Session name..."
        className="flex-1"
      />
      {providers.length > 1 && (
        <select
          value={selectedProviderId}
          onChange={(e) => onProviderChange(e.target.value)}
          className="rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
    <div className="flex gap-2">
      <Input
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder="Initial message for the agent..."
        className="flex-1"
      />
      <Button
        type="submit"
        size="sm"
        disabled={!name.trim() || !message.trim()}
      >
        <Play className="h-4 w-4" />
        Start
      </Button>
    </div>
  </form>
)
