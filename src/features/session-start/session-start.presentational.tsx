import type { FC } from 'react'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Play } from 'lucide-react'
import { SessionStartSelect } from './session-start-select.presentational'

interface SessionStartFormProps {
  name: string
  message: string
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  onNameChange: (value: string) => void
  onMessageChange: (value: string) => void
  onProviderChange: (id: string) => void
  onModelChange: (id: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  onSubmit: () => void
}

export const SessionStartForm: FC<SessionStartFormProps> = ({
  name,
  message,
  providers,
  selection,
  onNameChange,
  onMessageChange,
  onProviderChange,
  onModelChange,
  onEffortChange,
  onSubmit,
}) => {
  const providerItems = providers.map((provider) => ({
    id: provider.id,
    label: provider.vendorLabel || provider.name,
    description:
      provider.vendorLabel && provider.vendorLabel !== provider.name
        ? provider.name
        : undefined,
  }))
  const modelItems =
    selection.provider?.modelOptions.map((model) => ({
      id: model.id,
      label: model.label,
      description: model.id,
    })) ?? []
  const effortItems =
    selection.model?.effortOptions.map((effort) => ({
      id: effort.id,
      label: effort.label,
      description: effort.description,
    })) ?? []

  return (
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
        <SessionStartSelect
          selectedId={selection.providerId}
          value={selection.providerLabel || 'Select provider'}
          items={providerItems}
          onChange={onProviderChange}
        />
        <SessionStartSelect
          selectedId={selection.modelId}
          value={selection.model?.label ?? 'Select model'}
          items={modelItems}
          onChange={onModelChange}
        />
        {effortItems.length > 0 && (
          <SessionStartSelect
            selectedId={selection.effortId}
            value={selection.effort?.label ?? 'Select effort'}
            items={effortItems}
            onChange={(id) => onEffortChange(id as ReasoningEffort)}
          />
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
}
