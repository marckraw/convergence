import type { FC } from 'react'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import type { ProjectContextItem } from '@/entities/project-context'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/cn.pure'
import { Play, Repeat } from 'lucide-react'
import { SessionStartSelect } from './session-start-select.presentational'

interface SessionStartFormProps {
  name: string
  message: string
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  contextItems: ProjectContextItem[]
  selectedContextIds: string[]
  onNameChange: (value: string) => void
  onMessageChange: (value: string) => void
  onProviderChange: (id: string) => void
  onModelChange: (id: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  onToggleContextItem: (id: string) => void
  onSubmit: () => void
}

export const SessionStartForm: FC<SessionStartFormProps> = ({
  name,
  message,
  providers,
  selection,
  contextItems,
  selectedContextIds,
  onNameChange,
  onMessageChange,
  onProviderChange,
  onModelChange,
  onEffortChange,
  onToggleContextItem,
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
      {contextItems.length > 0 ? (
        <div
          className="space-y-1.5 rounded-md border border-border/60 bg-card/30 px-3 py-2"
          data-testid="session-start-context-picker"
        >
          <p className="text-xs font-medium text-muted-foreground">
            Inject project context at session start
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {contextItems.map((item) => {
              const isSelected = selectedContextIds.includes(item.id)
              return (
                <li key={item.id}>
                  <Button
                    type="button"
                    size="sm"
                    variant={isSelected ? 'secondary' : 'outline'}
                    onClick={() => onToggleContextItem(item.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'h-auto rounded-full px-2 py-0.5 text-[11px]',
                      isSelected && 'border-primary text-primary',
                    )}
                  >
                    {item.reinjectMode === 'every-turn' ? (
                      <Repeat className="mr-1 h-3 w-3" />
                    ) : null}
                    <span className="truncate">
                      {item.label?.trim() ? item.label : 'Untitled'}
                    </span>
                  </Button>
                </li>
              )
            })}
          </ul>
          {selectedContextIds.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {selectedContextIds.length} item
              {selectedContextIds.length === 1 ? '' : 's'} will be injected at
              session start.
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
