import type { FC } from 'react'
import type { ProviderModelOption } from '@/entities/session'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'

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
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/35 px-4 py-5">
        <p className="text-sm text-muted-foreground">
          Pi is not available in this app runtime.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium">models.json</h4>
            <p className="text-xs text-muted-foreground">
              These models are always visible in Pi model pickers.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {modelsJsonModels.length}
          </span>
        </div>
        <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-card/35">
          {modelsJsonModels.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No Pi models were found in models.json.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {modelsJsonModels.map((model) => (
                <li key={model.id} className="px-3 py-2">
                  <p className="truncate text-sm font-medium">{model.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {model.id}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium">Additional Pi models</h4>
            <p className="text-xs text-muted-foreground">
              Selected models are added alongside models.json entries.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {selectedModelIdsSet.size} selected
          </span>
        </div>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search available Pi models..."
          />
          {selectedModelIdsSet.size > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                selectedModelIds.forEach((modelId) =>
                  onToggleModel(modelId, false),
                )
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-card/35">
          {optionalModels.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No matching Pi models.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {optionalModels.map((model) => {
                const checked = selectedModelIdsSet.has(model.id)
                return (
                  <li key={model.id}>
                    <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2">
                      <Input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-primary shadow-none"
                        checked={checked}
                        onChange={(event) =>
                          onToggleModel(model.id, event.target.checked)
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {model.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
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
