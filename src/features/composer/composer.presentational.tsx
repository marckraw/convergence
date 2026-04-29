import type { FC, ClipboardEvent, DragEvent, KeyboardEvent, Ref } from 'react'
import type {
  MidRunInputMode,
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
} from '@/entities/session'
import { AttachmentsRow, type Attachment } from '@/entities/attachment'
import type { ProjectContextItem } from '@/entities/project-context'
import type { SkillCatalogEntry, SkillSelection } from '@/entities/skill'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/cn.pure'
import { ArrowUp, Paperclip, Repeat } from 'lucide-react'
import { ComposerSelect } from './composer-select.presentational'
import { ComposerContextMentionPicker } from './composer-context-mention.presentational'
import { SkillPicker } from './skill-picker.presentational'
import { SkillSelectionChip } from './skill-selection-chip.presentational'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  onProviderChange: (id: string) => void
  onModelChange: (id: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  deliveryMode: MidRunInputMode
  deliveryModes: MidRunInputMode[]
  onDeliveryModeChange: (mode: MidRunInputMode) => void
  selectionDisabled?: boolean
  placeholder?: string
  disabled?: boolean
  attachments: Attachment[]
  attachmentErrorByAttachmentId: Record<string, string>
  hasAttachmentErrors: boolean
  attachmentsIngestInFlight: boolean
  isDragging: boolean
  skillPickerOpen: boolean
  skillQuery: string
  skillOptions: SkillCatalogEntry[]
  selectedSkills: SkillSelection[]
  skillCatalogLoading: boolean
  skillCatalogError: string | null
  onSkillPickerOpenChange: (open: boolean) => void
  onSkillQueryChange: (query: string) => void
  onSkillToggle: (skill: SkillCatalogEntry) => void
  onSkillRemove: (skillId: string) => void
  onAttachmentAdd: () => void
  onSkillsBrowse: () => void
  onAttachmentRemove: (attachmentId: string) => void
  onAttachmentOpen: (attachment: Attachment) => void
  onDragEnter: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  everyTurnContextCount?: number
  textareaRef?: Ref<HTMLTextAreaElement>
  mentionPickerOpen?: boolean
  mentionItems?: ProjectContextItem[]
  mentionHighlightedIndex?: number
  onMentionSelect?: (item: ProjectContextItem) => void
  onMentionHover?: (index: number) => void
  onMentionDismiss?: () => void
  onSelectionChange?: (cursor: number) => void
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
  deliveryMode,
  deliveryModes,
  onDeliveryModeChange,
  selectionDisabled = false,
  placeholder = 'Ask anything, @tag files/folders, / for commands, :: for project context...',
  disabled = false,
  attachments,
  attachmentErrorByAttachmentId,
  hasAttachmentErrors,
  attachmentsIngestInFlight,
  isDragging,
  skillPickerOpen,
  skillQuery,
  skillOptions,
  selectedSkills,
  skillCatalogLoading,
  skillCatalogError,
  onSkillPickerOpenChange,
  onSkillQueryChange,
  onSkillToggle,
  onSkillRemove,
  onSkillsBrowse,
  onAttachmentAdd,
  onAttachmentRemove,
  onAttachmentOpen,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onPaste,
  everyTurnContextCount = 0,
  textareaRef,
  mentionPickerOpen = false,
  mentionItems = [],
  mentionHighlightedIndex = 0,
  onMentionSelect,
  onMentionHover,
  onMentionDismiss,
  onSelectionChange,
}) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionPickerOpen && mentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        onMentionHover?.((mentionHighlightedIndex + 1) % mentionItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onMentionHover?.(
          (mentionHighlightedIndex - 1 + mentionItems.length) %
            mentionItems.length,
        )
        return
      }
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const item = mentionItems[mentionHighlightedIndex]
        if (item) onMentionSelect?.(item)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onMentionDismiss?.()
        return
      }
    }
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

  const modeLabels: Partial<Record<MidRunInputMode, string>> = {
    answer: 'Answer',
    'follow-up': 'Follow-up',
    steer: 'Steer',
  }
  const visibleDeliveryModes = deliveryModes.filter((mode) => mode !== 'normal')

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
        {selectedSkills.length > 0 ? (
          <div
            className="mb-2 flex flex-wrap gap-1.5"
            data-testid="selected-skills-row"
          >
            {selectedSkills.map((selection) => (
              <SkillSelectionChip
                key={selection.id}
                selection={selection}
                onRemove={onSkillRemove}
              />
            ))}
          </div>
        ) : null}
        {everyTurnContextCount > 0 ? (
          <div
            className="mb-2 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-200"
            data-testid="every-turn-context-badge"
            title="Every-turn project context items are re-sent on every message in this session."
          >
            <Repeat className="h-3 w-3" />
            <span>
              Every-turn context active · {everyTurnContextCount} item
              {everyTurnContextCount === 1 ? '' : 's'}
            </span>
          </div>
        ) : null}
        <div className="relative">
          <ComposerContextMentionPicker
            open={mentionPickerOpen}
            items={mentionItems}
            highlightedIndex={mentionHighlightedIndex}
            onSelect={(item) => onMentionSelect?.(item)}
            onHover={(index) => onMentionHover?.(index)}
            onDismiss={() => onMentionDismiss?.()}
          />
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              onSelectionChange?.(e.target.selectionStart ?? 0)
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) =>
              onSelectionChange?.(e.currentTarget.selectionStart ?? 0)
            }
            onClick={(e) =>
              onSelectionChange?.(e.currentTarget.selectionStart ?? 0)
            }
            onInput={handleInput}
            onPaste={onPaste}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="min-h-0 resize-none border-0 px-0 py-0 text-foreground shadow-none focus-visible:ring-0"
          />
        </div>
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
            <SkillPicker
              open={skillPickerOpen}
              onOpenChange={onSkillPickerOpenChange}
              query={skillQuery}
              onQueryChange={onSkillQueryChange}
              skills={skillOptions}
              selectedSkills={selectedSkills}
              activeProviderLabel={selection.providerLabel}
              isLoading={skillCatalogLoading}
              error={skillCatalogError}
              disabled={disabled || !selection.provider}
              onToggleSkill={onSkillToggle}
              onBrowseAll={onSkillsBrowse}
            />
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
            {visibleDeliveryModes.length > 1 ? (
              <div
                className="flex h-7 items-center rounded-md border border-border bg-background p-0.5"
                aria-label="Delivery mode"
                role="radiogroup"
              >
                {visibleDeliveryModes.map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    variant="ghost"
                    size="sm"
                    role="radio"
                    aria-checked={deliveryMode === mode}
                    className={cn(
                      'h-5 rounded-sm px-2 text-[11px] font-medium text-muted-foreground shadow-none transition-colors',
                      deliveryMode === mode
                        ? 'bg-secondary text-secondary-foreground'
                        : 'hover:text-foreground',
                    )}
                    onClick={() => onDeliveryModeChange(mode)}
                    disabled={disabled}
                  >
                    {modeLabels[mode] ?? mode}
                  </Button>
                ))}
              </div>
            ) : visibleDeliveryModes.length === 1 ? (
              <span className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {modeLabels[visibleDeliveryModes[0]] ?? visibleDeliveryModes[0]}
              </span>
            ) : null}
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
