import type { FC, FormEvent } from 'react'
import { Paperclip } from 'lucide-react'
import {
  AttachmentsRow,
  type Attachment,
  type AttachmentDraftController,
} from '@/entities/attachment'
import {
  getProviderLifecycleBadge,
  type ProviderInfo,
  type ReasoningEffort,
  type ResolvedProviderSelection,
} from '@/entities/session'
import { ModelPickerDialog } from '@/features/model-picker'
import { SessionStartSelect } from '@/features/session-start'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/cn.pure'

interface ForkComposerProps {
  textareaId?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  attachmentDraft: AttachmentDraftController
  attachmentErrorByAttachmentId?: Record<string, string>
  onAttachmentOpen: (attachment: Attachment) => void
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  onProviderChange: (id: string) => void
  onModelChange: (id: string, providerId?: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
}

/**
 * A trimmed, composer-styled seed editor for the fork dialog: multiline
 * instruction + attachments + the "run-with" provider/model/effort selectors,
 * without the live composer's skills/context/prompt/permission surface.
 */
export const ForkComposer: FC<ForkComposerProps> = ({
  textareaId,
  value,
  onChange,
  placeholder = 'What should the fork focus on? Paste or drop images to seed it.',
  disabled = false,
  attachmentDraft,
  attachmentErrorByAttachmentId,
  onAttachmentOpen,
  providers,
  selection,
  onProviderChange,
  onModelChange,
  onEffortChange,
}) => {
  const {
    attachments,
    ingestInFlight,
    isDragging,
    dragHandlers,
    onPaste,
    openFileDialog,
    removeOne,
  } = attachmentDraft

  const providerItems = providers.map((provider) => ({
    id: provider.id,
    label: provider.vendorLabel || provider.name,
    description:
      provider.vendorLabel && provider.vendorLabel !== provider.name
        ? provider.name
        : undefined,
    badge: getProviderLifecycleBadge(provider) ?? undefined,
  }))
  const effortItems =
    selection.model?.effortOptions.map((effort) => ({
      id: effort.id,
      label: effort.label,
      description: effort.description,
    })) ?? []

  const handleInput = (e: FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-3 transition-colors',
        isDragging ? 'border-primary border-dashed' : 'border-border',
      )}
      onDragEnter={dragHandlers.onDragEnter}
      onDragLeave={dragHandlers.onDragLeave}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      data-testid="fork-composer"
    >
      <AttachmentsRow
        attachments={attachments}
        errorByAttachmentId={attachmentErrorByAttachmentId}
        onOpen={onAttachmentOpen}
        onRemove={removeOne}
      />
      <Textarea
        id={textareaId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={handleInput}
        onPaste={onPaste}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="min-h-0 resize-none border-0 px-0 py-0 text-foreground shadow-none focus-visible:ring-0"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Attach file"
          onClick={() => void openFileDialog()}
          disabled={disabled || ingestInFlight}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Attach
          {attachments.length > 0 ? (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
              {attachments.length}
            </span>
          ) : null}
        </Button>
        <SessionStartSelect
          selectedId={selection.providerId}
          value={selection.providerLabel || 'Select provider'}
          items={providerItems}
          onChange={onProviderChange}
        />
        <ModelPickerDialog
          providers={providers}
          selectedProviderId={selection.providerId}
          selectedModelId={selection.modelId}
          value={selection.model?.label ?? 'Select model'}
          onChange={(providerId, modelId) => onModelChange(modelId, providerId)}
          triggerClassName="px-2 text-xs"
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
    </div>
  )
}
