import type { FC } from 'react'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { ArrowUp } from 'lucide-react'
import { ComposerSelect } from './composer-select.presentational'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  onProviderChange: (id: string) => void
  onModelChange: (id: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  selectionDisabled?: boolean
  placeholder?: string
  disabled?: boolean
}

export const Composer: FC<ComposerProps> = ({
  value,
  onChange,
  onSubmit,
  providers,
  selection,
  onProviderChange,
  onModelChange,
  onEffortChange,
  selectionDisabled = false,
  placeholder = 'Ask anything, @tag files/folders, or use / to show available commands...',
  disabled = false,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        onSubmit()
      }
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`
  }

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
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <ComposerSelect
              selectedId={selection.providerId}
              value={selection.providerLabel || 'Select provider'}
              items={providerItems}
              onChange={onProviderChange}
              disabled={selectionDisabled}
              className="gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
            />
            <ComposerSelect
              selectedId={selection.modelId}
              value={selection.model?.label ?? 'Select model'}
              items={modelItems}
              onChange={onModelChange}
              disabled={selectionDisabled || !selection.provider}
              className="px-2 text-xs text-muted-foreground hover:text-foreground"
            />
            {effortItems.length > 0 && (
              <ComposerSelect
                selectedId={selection.effortId}
                value={selection.effort?.label ?? 'Select effort'}
                items={effortItems}
                onChange={(id) => onEffortChange(id as ReasoningEffort)}
                disabled={selectionDisabled || !selection.model}
                className="px-2 text-xs text-muted-foreground hover:text-foreground"
              />
            )}
          </div>
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 rounded-full"
            disabled={!value.trim() || disabled}
            onClick={onSubmit}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        ⌘ + Enter to send
      </p>
    </div>
  )
}
