import type { FC } from 'react'
import { Paperclip } from 'lucide-react'
import {
  AttachmentsRow,
  type Attachment,
  type AttachmentDraftController,
} from '@/entities/attachment'
import type {
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import { Badge, Button, ComposerCard, Textarea } from '@convergence/ui'
import { ModelSelectorRow } from './model-selector-row.presentational'

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

  return (
    // The composer's own card (CONV-17), trimmed to what a fork's seed needs.
    <ComposerCard
      dragging={isDragging}
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
        onPaste={onPaste}
        // It grows with what's typed, to about 200 px, then scrolls (CONV-17).
        autoGrow
        maxRows={8}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        variant="bare"
        className="text-ink"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="quiet"
          aria-label="Attach file"
          onClick={() => void openFileDialog()}
          disabled={disabled || ingestInFlight}
          size="sm"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Attach
          {attachments.length > 0 ? (
            <Badge shape="count">{attachments.length}</Badge>
          ) : null}
        </Button>
        <ModelSelectorRow
          providers={providers}
          selection={selection}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
        />
      </div>
    </ComposerCard>
  )
}
