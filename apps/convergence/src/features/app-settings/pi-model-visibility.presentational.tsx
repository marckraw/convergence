import type { FC } from 'react'
import type { ProviderModelOption } from '@/entities/session'
import { Button, Checkbox, EmptyState, SearchField } from '@convergence/ui'

interface PiModelVisibilityFieldsProps {
  providerExists: boolean
  modelsJsonModels: ProviderModelOption[]
  optionalModels: ProviderModelOption[]
  query: string
  selectedModelIds: string[]
  selectedModelIdsSet: Set<string>
  onQueryChange: (value: string) => void
  onToggleModel: (modelId: string, next: boolean) => void
}

/** A list's head: its name and line, then its count. */
const listHead = 'flex items-center justify-between gap-3'

export const PiModelVisibilityFields: FC<PiModelVisibilityFieldsProps> = ({
  providerExists,
  modelsJsonModels,
  optionalModels,
  query,
  selectedModelIds,
  selectedModelIdsSet,
  onQueryChange,
  onToggleModel,
}) => {
  if (!providerExists) {
    return <EmptyState detail="Pi is not available in this app runtime." />
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className={listHead}>
          <div>
            <h4 className="text-sm font-medium">models.json</h4>
            <p className="text-xs text-ink-muted">
              These models are always visible in Pi model pickers.
            </p>
          </div>
          <span className="text-xs text-ink-muted">
            {modelsJsonModels.length}
          </span>
        </div>
        <div className="max-h-48 overflow-y-auto rounded-md border border-line bg-surface/35">
          {modelsJsonModels.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-muted">
              No Pi models were found in models.json.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {modelsJsonModels.map((model) => (
                <li key={model.id} className="px-3 py-2">
                  <p className="truncate text-sm font-medium">{model.label}</p>
                  <p className="truncate text-xs text-ink-muted">{model.id}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className={listHead}>
          <div>
            <h4 className="text-sm font-medium">Additional Pi models</h4>
            <p className="text-xs text-ink-muted">
              Selected models are added alongside models.json entries.
            </p>
          </div>
          <span className="text-xs text-ink-muted">
            {selectedModelIdsSet.size} selected
          </span>
        </div>

        <div className="flex gap-2">
          <SearchField
            size="lg"
            className="flex-1"
            aria-label="Search available Pi models"
            placeholder="Search available Pi models…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onClear={() => onQueryChange('')}
          />
          {selectedModelIdsSet.size > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                selectedModelIds.forEach((modelId) =>
                  onToggleModel(modelId, false),
                )
              }}
            >
              Clear selection
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto rounded-md border border-line bg-surface/35">
          {optionalModels.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-muted">
              No matching Pi models.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {optionalModels.map((model) => {
                const checked = selectedModelIdsSet.has(model.id)
                return (
                  <li key={model.id}>
                    <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          onToggleModel(model.id, next)
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {model.label}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {model.id}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
