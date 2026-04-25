import type { FC, ClipboardEvent, DragEvent } from 'react'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import type { Attachment } from '@/entities/attachment'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/cn.pure'
import { ArrowUp, Library, Paperclip } from 'lucide-react'
import { ComposerSelect } from './composer-select.presentational'
import { AttachmentsRow } from './attachments-row.presentational'

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
  attachments: Attachment[]
  attachmentErrorByAttachmentId: Record<string, string>
  hasAttachmentErrors: boolean
  attachmentsIngestInFlight: boolean
  isDragging: boolean
  onAttachmentAdd: () => void
  onSkillsBrowse: () => void
  onAttachmentRemove: (attachmentId: string) => void
  onAttachmentOpen: (attachment: Attachment) => void
  onDragEnter: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void
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
  attachments,
  attachmentErrorByAttachmentId,
  hasAttachmentErrors,
  attachmentsIngestInFlight,
  isDragging,
  onSkillsBrowse,
  onAttachmentAdd,
  onAttachmentRemove,
  onAttachmentOpen,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onPaste,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (
        (value.trim() || attachments.length > 0) &&
        !disabled &&
        !hasAttachmentErrors
      ) {
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

  const canSend =
    !disabled &&
    !hasAttachmentErrors &&
    !attachmentsIngestInFlight &&
    (value.trim().length > 0 || attachments.length > 0)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        className={cn(
          'rounded-xl border bg-card p-3 transition-colors',
          isDragging ? 'border-primary border-dashed' : 'border-border',
        )}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        data-testid="composer-root"
      >
        <AttachmentsRow
          attachments={attachments}
          errorByAttachmentId={attachmentErrorByAttachmentId}
          onOpen={onAttachmentOpen}
          onRemove={onAttachmentRemove}
        />
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={onPaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="min-h-0 resize-none border-0 px-0 py-0 text-foreground shadow-none focus-visible:ring-0"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Add attachment"
              onClick={onAttachmentAdd}
              disabled={disabled || attachmentsIngestInFlight}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Browse skills"
              onClick={onSkillsBrowse}
            >
              <Library className="h-3.5 w-3.5" />
              Skills
            </Button>
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
            disabled={!canSend}
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
