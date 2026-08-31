import type { FC } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import type { ProviderInfo } from '@/entities/session'
import { ModelPickerDialog } from '@/features/model-picker'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { SearchableSelect } from '@/shared/ui/searchable-select.container'
import type { SearchableSelectItem } from '@/shared/ui/searchable-select.presentational'

interface GenerateProfileDialogProps {
  open: boolean
  providerId: string
  providerLabel: string
  modelId: string
  modelLabel: string
  providers: ProviderInfo[]
  providerItems: SearchableSelectItem[]
  isGenerating: boolean
  onOpenChange: (open: boolean) => void
  onProviderChange: (providerId: string) => void
  onModelChange: (modelId: string, providerId?: string) => void
  onConfirm: () => void
}

export const GenerateProfileDialog: FC<GenerateProfileDialogProps> = ({
  open,
  providerId,
  providerLabel,
  modelId,
  modelLabel,
  providers,
  providerItems,
  isGenerating,
  onOpenChange,
  onProviderChange,
  onModelChange,
  onConfirm,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[min(560px,calc(100vw-2rem))]">
      <DialogHeader className="border-b border-border/70 px-6 py-5 pr-14">
        <DialogTitle>Generate work profile</DialogTitle>
        <DialogDescription>
          Create an optional profile from local aggregate usage data.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 px-6 py-5">
        <section className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-900 dark:text-amber-100">
          Convergence will prepare a local summary with aggregate counts,
          project names, provider names, and session metadata. Full transcripts
          and raw conversation excerpts are not sent in this version.
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Provider
            </label>
            <SearchableSelect
              selectedId={providerId}
              value={providerLabel}
              items={providerItems}
              onChange={onProviderChange}
              disabled={isGenerating || providerItems.length === 0}
              searchPlaceholder="Search providers..."
              emptyMessage="No providers available."
              triggerVariant="outline"
              triggerSize="sm"
              triggerClassName="w-full justify-between px-2 text-xs"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Model
            </label>
            <ModelPickerDialog
              providers={providers}
              selectedProviderId={providerId}
              selectedModelId={modelId}
              value={modelLabel}
              onChange={(nextProviderId, nextModelId) =>
                onModelChange(nextModelId, nextProviderId)
              }
              disabled={isGenerating || providers.length === 0}
              triggerVariant="outline"
              triggerSize="sm"
              triggerClassName="w-full justify-between px-2 text-xs"
            />
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-card/60 p-4">
          <span className="rounded-md border border-border bg-background p-2 text-muted-foreground">
            <Bot className="size-4" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The selected provider receives only the prepared summary when you
            confirm. The generated snapshot is stored locally and can be deleted
            without deleting session history.
          </p>
        </div>
      </div>

      <DialogFooter className="border-t border-border/70 px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isGenerating}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={isGenerating || !providerId || !modelId}
        >
          <Sparkles className="size-4" />
          {isGenerating ? 'Generating...' : 'Generate'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
