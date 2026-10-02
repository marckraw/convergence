import type { FC } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import type { ProviderInfo } from '@/entities/session'
import { ModelPickerDialog } from '@/features/model-picker'
import {
  Card,
  Combobox,
  type ComboboxItem,
  Field,
  FieldLabel,
  FormDialog,
  Notice,
} from '@convergence/ui'

interface GenerateProfileDialogProps {
  open: boolean
  providerId: string
  providerLabel: string
  modelId: string
  modelLabel: string
  providers: ProviderInfo[]
  providerItems: ComboboxItem[]
  isGenerating: boolean
  onOpenChange: (open: boolean) => void
  onProviderChange: (providerId: string) => void
  onModelChange: (modelId: string, providerId?: string) => void
  onConfirm: () => void
}

/** Why Generate waits, or nothing when it can go. */
function generateBlock(
  providerId: string,
  modelId: string,
): string | undefined {
  if (!providerId) return 'Choose a provider first.'
  if (!modelId) return 'Choose a model first.'
  return undefined
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
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title="Generate work profile"
    description="Create an optional profile from local aggregate usage data."
    size="md"
    saves="on-save"
    onSave={onConfirm}
    saveLabel={
      <>
        <Sparkles aria-hidden className="size-4" />
        Generate
      </>
    }
    pendingLabel="Generating…"
    pending={isGenerating}
    saveDisabledReason={generateBlock(providerId, modelId)}
  >
    <div className="space-y-5">
      <Notice tone="warning" title="Only a summary leaves this Mac">
        Convergence will prepare a local summary with aggregate counts, project
        names, provider names, and session metadata. Full transcripts and raw
        conversation excerpts are not sent in this version.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* In its Field the Combobox is named by the label, and its search
            keeps its own name (DLG-7). */}
        <Field>
          <FieldLabel nativeLabel={false} render={<div />}>
            Provider
          </FieldLabel>
          <Combobox
            selectedId={providerId}
            value={providerLabel}
            items={providerItems}
            onChange={onProviderChange}
            disabled={isGenerating || providerItems.length === 0}
            searchPlaceholder="Search providers…"
            emptyMessage="No providers available."
            variant="field"
            className="w-full"
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="text-sm font-medium">
            Model
          </span>
          <ModelPickerDialog
            label="Model"
            providers={providers}
            selectedProviderId={providerId}
            selectedModelId={modelId}
            value={modelLabel}
            onChange={(nextProviderId, nextModelId) =>
              onModelChange(nextModelId, nextProviderId)
            }
            disabled={isGenerating || providers.length === 0}
            triggerVariant="field"
            triggerSize="md"
            triggerClassName="w-full"
          />
        </div>
      </div>

      <Card padding="md" className="flex items-start gap-3">
        <span className="rounded-md border border-line bg-canvas p-2 text-ink-muted">
          <Bot className="size-4" />
        </span>
        <p className="text-sm leading-relaxed text-ink-muted">
          The selected provider receives only the prepared summary when you
          confirm. The generated snapshot is stored locally and can be deleted
          without deleting session history.
        </p>
      </Card>
    </div>
  </FormDialog>
)
