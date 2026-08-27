import type {
  FC,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  ReactNode,
  Ref,
} from 'react'
import type {
  MidRunInputMode,
  ProviderInfo,
  ReasoningEffort,
  ResolvedProviderSelection,
  SessionPermissionConfig,
  CodexApprovalPolicy,
  CodexSandboxMode,
  ClaudeCodePermissionMode,
} from '@/entities/session'
import {
  CLAUDE_CODE_PERMISSION_MODE_OPTIONS,
  CODEX_APPROVAL_POLICY_OPTIONS,
  CODEX_SANDBOX_OPTIONS,
  getProviderLifecycleBadge,
  getSimplePermissionPreset,
  scopeModelCatalogToProvider,
} from '@/entities/session'
import { AttachmentsRow, type Attachment } from '@/entities/attachment'
import type { ProjectContextItem } from '@/entities/project-context'
import type { PromptLibraryEntry } from '@/entities/prompt-library'
import type { SkillCatalogEntry, SkillSelection } from '@/entities/skill'
import type { ComposerInjectionRootItem } from './composer-injection-trigger.pure'
import { ModelPickerDialog } from '@/features/model-picker'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/cn.pure'
import {
  ArrowUp,
  Bell,
  BellOff,
  FileText,
  Paperclip,
  Plus,
  Repeat,
  SlidersHorizontal,
  X,
  Zap,
} from 'lucide-react'
import { ComposerSelect } from './composer-select.presentational'
import { ExecutionBar } from './execution-bar.presentational'
import type { ExecutionBarView } from './execution-bar.pure'
import { composerCardDepthClassByMode } from './execution-bar.styles'
import { relayMuteTitle } from './relay-mute.pure'
import { ProviderAccountPicker } from '@/entities/provider-account'
import type { ProviderAccount } from '@/entities/provider-account'
import { ComposerContextMentionPicker } from './composer-context-mention.presentational'
import { ComposerInjectionRootPicker } from './composer-injection-root-picker.presentational'
import { ComposerPromptInjectionPicker } from './composer-prompt-injection-picker.presentational'
import { ComposerSkillInjectionPicker } from './composer-skill-injection-picker.presentational'
import { ProjectContextPicker } from './project-context-picker.presentational'
import { SkillPicker } from './skill-picker.presentational'
import { SkillSelectionChip } from './skill-selection-chip.presentational'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  providers: ProviderInfo[]
  selection: ResolvedProviderSelection
  onProviderChange: (id: string) => void
  onModelChange: (id: string, providerId?: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  providerAccounts: ProviderAccount[]
  selectedProviderAccountId: string | null
  onProviderAccountChange: (accountId: string | null) => void
  providerAccountSelectionLocked: boolean
  providerAccountSelectionBlockedReason: string | null
  codexFastMode: boolean
  onCodexFastModeChange: (enabled: boolean) => void
  executionBar: ExecutionBarView
  onExecutionHostChange: (hostId: string) => void
  /**
   * Armed wires leaving this session (F10). Zero renders no control at all --
   * a switch that silences nothing is noise on every other composer.
   */
  armedOutgoingRelays: number
  relaysMuted: boolean
  onRelaysMutedChange: (muted: boolean) => void
  permissionConfig: SessionPermissionConfig
  permissionAdvancedOpen: boolean
  onPermissionPresetChange: (preset: 'ask' | 'yolo') => void
  onPermissionAdvancedOpenChange: (open: boolean) => void
  onCodexApprovalPolicyChange: (policy: CodexApprovalPolicy) => void
  onCodexSandboxChange: (mode: CodexSandboxMode) => void
  onClaudeCodePermissionModeChange: (mode: ClaudeCodePermissionMode) => void
  usagePill?: ReactNode
  contextWindowDot?: ReactNode
  deliveryMode: MidRunInputMode
  deliveryModes: MidRunInputMode[]
  onDeliveryModeChange: (mode: MidRunInputMode) => void
  /**
   * Locks the parts of the selection row that a session fixes for life --
   * above all the provider, whose continuation token is provider-specific.
   * True the moment a resumable session exists.
   */
  selectionDisabled?: boolean
  /**
   * Locks the model and effort pickers, which a session does NOT fix for life
   * (MAR-2550). Split from `selectionDisabled` rather than folded into it: the
   * two answer different questions, and one boolean would have to answer the
   * stricter one, which is how the model stayed frozen for no reason.
   */
  modelSelectionDisabled?: boolean
  /**
   * The provider the session behind this composer is pinned to, or null while
   * it is still a draft (MAR-2550).
   *
   * Scopes the model dialog's catalog. The dialog reports a provider alongside
   * the model it hands back, so an unscoped catalog was a second way to change
   * the provider — one the provider select's lock never covered.
   */
  sessionProviderId?: string | null
  placeholder?: string
  disabled?: boolean
  attachments: Attachment[]
  /**
   * Response annotations waiting in the tray above this composer. They are
   * message content too, so a send with an empty box and a full tray is a
   * complete thought rather than an empty one (RA2).
   */
  hasPendingAnnotations?: boolean
  attachmentErrorByAttachmentId: Record<string, string>
  hasAttachmentErrors: boolean
  attachmentsIngestInFlight: boolean
  isDragging: boolean
  skillPickerOpen: boolean
  skillQuery: string
  skillOptions: SkillCatalogEntry[]
  selectedSkills: SkillSelection[]
  contextPickerOpen: boolean
  projectContextEnabled?: boolean
  projectContextItems: ProjectContextItem[]
  selectedContextItems: ProjectContextItem[]
  skillCatalogLoading: boolean
  skillCatalogError: string | null
  onSkillPickerOpenChange: (open: boolean) => void
  onSkillQueryChange: (query: string) => void
  onSkillToggle: (skill: SkillCatalogEntry) => void
  onSkillRemove: (skillId: string) => void
  onContextPickerOpenChange: (open: boolean) => void
  onContextToggle: (id: string) => void
  onContextRemove: (id: string) => void
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
  rootInjectionPickerOpen?: boolean
  rootInjectionItems?: ComposerInjectionRootItem[]
  rootInjectionHighlightedIndex?: number
  onRootInjectionSelect?: (item: ComposerInjectionRootItem) => void
  onRootInjectionHover?: (index: number) => void
  onRootInjectionDismiss?: () => void
  skillInjectionPickerOpen?: boolean
  skillInjectionItems?: SkillCatalogEntry[]
  skillInjectionHighlightedIndex?: number
  onSkillInjectionSelect?: (skill: SkillCatalogEntry) => void
  onSkillInjectionHover?: (index: number) => void
  onSkillInjectionDismiss?: () => void
  promptInjectionPickerOpen?: boolean
  promptInjectionItems?: PromptLibraryEntry[]
  promptInjectionHighlightedIndex?: number
  promptInjectionLoading?: boolean
  promptInjectionError?: string | null
  onPromptInjectionSelect?: (prompt: PromptLibraryEntry) => void
  onPromptInjectionHover?: (index: number) => void
  onPromptInjectionDismiss?: () => void
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
  providerAccounts,
  selectedProviderAccountId,
  onProviderAccountChange,
  providerAccountSelectionLocked,
  providerAccountSelectionBlockedReason,
  codexFastMode,
  onCodexFastModeChange,
  executionBar,
  onExecutionHostChange,
  armedOutgoingRelays,
  relaysMuted,
  onRelaysMutedChange,
  permissionConfig,
  permissionAdvancedOpen,
  onPermissionPresetChange,
  onPermissionAdvancedOpenChange,
  onCodexApprovalPolicyChange,
  onCodexSandboxChange,
  onClaudeCodePermissionModeChange,
  usagePill,
  contextWindowDot,
  deliveryMode,
  deliveryModes,
  onDeliveryModeChange,
  selectionDisabled = false,
  modelSelectionDisabled = false,
  sessionProviderId = null,
  placeholder = 'Ask anything, @tag files/folders, :: for injections...',
  disabled = false,
  hasPendingAnnotations = false,
  attachments,
  attachmentErrorByAttachmentId,
  hasAttachmentErrors,
  attachmentsIngestInFlight,
  isDragging,
  skillPickerOpen,
  skillQuery,
  skillOptions,
  selectedSkills,
  contextPickerOpen,
  projectContextEnabled = true,
  projectContextItems,
  selectedContextItems,
  skillCatalogLoading,
  skillCatalogError,
  onSkillPickerOpenChange,
  onSkillQueryChange,
  onSkillToggle,
  onSkillRemove,
  onContextPickerOpenChange,
  onContextToggle,
  onContextRemove,
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
  rootInjectionPickerOpen = false,
  rootInjectionItems = [],
  rootInjectionHighlightedIndex = 0,
  onRootInjectionSelect,
  onRootInjectionHover,
  onRootInjectionDismiss,
  skillInjectionPickerOpen = false,
  skillInjectionItems = [],
  skillInjectionHighlightedIndex = 0,
  onSkillInjectionSelect,
  onSkillInjectionHover,
  onSkillInjectionDismiss,
  promptInjectionPickerOpen = false,
  promptInjectionItems = [],
  promptInjectionHighlightedIndex = 0,
  promptInjectionLoading = false,
  promptInjectionError = null,
  onPromptInjectionSelect,
  onPromptInjectionHover,
  onPromptInjectionDismiss,
  mentionPickerOpen = false,
  mentionItems = [],
  mentionHighlightedIndex = 0,
  onMentionSelect,
  onMentionHover,
  onMentionDismiss,
  onSelectionChange,
}) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (rootInjectionPickerOpen && rootInjectionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        onRootInjectionHover?.(
          (rootInjectionHighlightedIndex + 1) % rootInjectionItems.length,
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onRootInjectionHover?.(
          (rootInjectionHighlightedIndex - 1 + rootInjectionItems.length) %
            rootInjectionItems.length,
        )
        return
      }
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const item = rootInjectionItems[rootInjectionHighlightedIndex]
        if (item) onRootInjectionSelect?.(item)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onRootInjectionDismiss?.()
        return
      }
    }

    if (skillInjectionPickerOpen) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onSkillInjectionDismiss?.()
        return
      }
      if (skillInjectionItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onSkillInjectionHover?.(
            (skillInjectionHighlightedIndex + 1) % skillInjectionItems.length,
          )
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          onSkillInjectionHover?.(
            (skillInjectionHighlightedIndex - 1 + skillInjectionItems.length) %
              skillInjectionItems.length,
          )
          return
        }
        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          const skill = skillInjectionItems[skillInjectionHighlightedIndex]
          if (skill) onSkillInjectionSelect?.(skill)
          return
        }
      }
    }

    if (promptInjectionPickerOpen) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onPromptInjectionDismiss?.()
        return
      }
      if (promptInjectionItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onPromptInjectionHover?.(
            (promptInjectionHighlightedIndex + 1) % promptInjectionItems.length,
          )
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          onPromptInjectionHover?.(
            (promptInjectionHighlightedIndex -
              1 +
              promptInjectionItems.length) %
              promptInjectionItems.length,
          )
          return
        }
        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          const prompt = promptInjectionItems[promptInjectionHighlightedIndex]
          if (prompt) onPromptInjectionSelect?.(prompt)
          return
        }
      }
    }

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
        (value.trim() || attachments.length > 0 || hasPendingAnnotations) &&
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
    badge: getProviderLifecycleBadge(provider) ?? undefined,
  }))
  // An existing session may move between its own provider's models and no
  // further (MAR-2550). A draft keeps the whole catalog.
  const modelCatalogProviders = scopeModelCatalogToProvider(
    providers,
    sessionProviderId,
  )
  // A stranded session has no catalog model to read options from, but its row
  // still carries an effort. Showing it, disabled, beats hiding the control and
  // leaving the human to guess what the row says (MAR-2550).
  const effortItems = (
    selection.model?.effortOptions ??
    (selection.effort ? [selection.effort] : [])
  ).map((effort) => ({
    id: effort.id,
    label: effort.label,
    description: effort.description,
  }))
  const permissionItems = [
    {
      id: 'ask',
      label: 'Ask',
      description: 'Ask before risky provider actions.',
    },
    {
      id: 'yolo',
      label: 'Yolo',
      description: 'Give the provider full execution freedom.',
    },
  ]
  const simplePermissionPreset = getSimplePermissionPreset(permissionConfig)
  const codexConfig = permissionConfig.codex ?? {
    approvalPolicy: 'on-request' as CodexApprovalPolicy,
    sandbox: 'workspace-write' as CodexSandboxMode,
  }
  const claudeCodeConfig = permissionConfig.claudeCode ?? {
    permissionMode: 'default' as ClaudeCodePermissionMode,
  }
  const canCustomizePermissions =
    selection.providerId === 'codex' || selection.providerId === 'claude-code'
  const resourceCount =
    attachments.length + selectedSkills.length + selectedContextItems.length

  const canSend =
    !disabled &&
    !hasAttachmentErrors &&
    !attachmentsIngestInFlight &&
    (value.trim().length > 0 || attachments.length > 0 || hasPendingAnnotations)

  const modeLabels: Partial<Record<MidRunInputMode, string>> = {
    answer: 'Answer',
    'follow-up': 'Follow-up',
    steer: 'Steer',
  }
  const visibleDeliveryModes = deliveryModes.filter((mode) => mode !== 'normal')

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/*
        The card and the strip are one drop target. Stacking them made the
        strip a sibling of the card rather than a child, and drag handlers left
        on the card alone would have made the visible band inert — a file
        dropped on it would land on nothing. One DOM tree carries both the
        layering and the behaviour, so the surface group owns the handlers and
        the two layers sit inside it. The send hint stays outside: it is not a
        drop target and never was.
      */}
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div
          className={cn(
            'rounded-xl border bg-card p-3 transition-colors',
            // The card is the upper of two stacked surfaces: the Execution Bar
            // is its sibling below, tucked behind this bottom edge.
            composerCardDepthClassByMode[executionBar.mode],
            isDragging ? 'border-primary border-dashed' : 'border-border',
          )}
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
          {projectContextEnabled && selectedContextItems.length > 0 ? (
            <div
              className="mb-2 flex flex-wrap gap-1.5"
              data-testid="selected-project-context-row"
            >
              {selectedContextItems.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {item.label?.trim() ? item.label : 'Untitled'}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 rounded-full"
                    aria-label={`Remove ${item.label?.trim() ? item.label : 'Untitled'} context`}
                    onClick={() => onContextRemove(item.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              ))}
            </div>
          ) : null}
          {projectContextEnabled && everyTurnContextCount > 0 ? (
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
            <ComposerInjectionRootPicker
              open={rootInjectionPickerOpen}
              items={rootInjectionItems}
              highlightedIndex={rootInjectionHighlightedIndex}
              onSelect={(item) => onRootInjectionSelect?.(item)}
              onHover={(index) => onRootInjectionHover?.(index)}
              onDismiss={() => onRootInjectionDismiss?.()}
            />
            <ComposerContextMentionPicker
              open={projectContextEnabled && mentionPickerOpen}
              items={mentionItems}
              highlightedIndex={mentionHighlightedIndex}
              onSelect={(item) => onMentionSelect?.(item)}
              onHover={(index) => onMentionHover?.(index)}
              onDismiss={() => onMentionDismiss?.()}
            />
            <ComposerSkillInjectionPicker
              open={skillInjectionPickerOpen}
              items={skillInjectionItems}
              selectedSkills={selectedSkills}
              highlightedIndex={skillInjectionHighlightedIndex}
              activeProviderLabel={selection.providerLabel}
              isLoading={skillCatalogLoading}
              error={skillCatalogError}
              onSelect={(skill) => onSkillInjectionSelect?.(skill)}
              onHover={(index) => onSkillInjectionHover?.(index)}
              onDismiss={() => onSkillInjectionDismiss?.()}
            />
            <ComposerPromptInjectionPicker
              open={promptInjectionPickerOpen}
              items={promptInjectionItems}
              highlightedIndex={promptInjectionHighlightedIndex}
              isLoading={promptInjectionLoading}
              error={promptInjectionError}
              onSelect={(prompt) => onPromptInjectionSelect?.(prompt)}
              onHover={(index) => onPromptInjectionHover?.(index)}
              onDismiss={() => onPromptInjectionDismiss?.()}
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                    aria-label="Add composer resources"
                    disabled={disabled}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                    {resourceCount > 0 ? (
                      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                        {resourceCount}
                      </span>
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-56 p-1"
                  onInteractOutside={(event) => {
                    if (skillPickerOpen || contextPickerOpen) {
                      event.preventDefault()
                    }
                  }}
                >
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Resources
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground hover:text-foreground"
                    aria-label="Add attachment"
                    onClick={onAttachmentAdd}
                    disabled={attachmentsIngestInFlight}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach file
                    {attachments.length > 0 ? (
                      <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                        {attachments.length}
                      </span>
                    ) : null}
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
                    disabled={!selection.provider}
                    triggerClassName="h-8 w-full justify-start gap-2 px-2"
                    onToggleSkill={onSkillToggle}
                    onBrowseAll={onSkillsBrowse}
                  />
                  {projectContextEnabled ? (
                    <ProjectContextPicker
                      open={contextPickerOpen}
                      onOpenChange={onContextPickerOpenChange}
                      items={projectContextItems}
                      selectedIds={selectedContextItems.map((item) => item.id)}
                      disabled={selectionDisabled}
                      triggerClassName="h-8 w-full justify-start gap-2 px-2"
                      onToggleItem={onContextToggle}
                    />
                  ) : null}
                </PopoverContent>
              </Popover>
              <ComposerSelect
                selectedId={selection.providerId}
                value={selection.providerLabel || 'Select provider'}
                items={providerItems}
                onChange={onProviderChange}
                disabled={selectionDisabled}
                className="gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              />
              <ModelPickerDialog
                providers={modelCatalogProviders}
                selectedProviderId={selection.providerId}
                selectedModelId={selection.modelId}
                value={
                  selection.model?.label || selection.modelId || 'Select model'
                }
                onChange={(providerId, modelId) =>
                  onModelChange(modelId, providerId)
                }
                disabled={modelSelectionDisabled || !selection.provider}
                triggerVariant="ghost"
                triggerSize="sm"
                triggerClassName="px-2 text-xs text-muted-foreground hover:text-foreground"
              />
              {effortItems.length > 0 && (
                <ComposerSelect
                  selectedId={selection.effortId}
                  value={selection.effort?.label ?? 'Select effort'}
                  items={effortItems}
                  onChange={(id) => onEffortChange(id as ReasoningEffort)}
                  disabled={modelSelectionDisabled || !selection.model}
                  className="px-2 text-xs text-muted-foreground hover:text-foreground"
                />
              )}
              {selection.providerId === 'claude-code' && (
                <ProviderAccountPicker
                  accounts={providerAccounts}
                  selectedAccountId={selectedProviderAccountId}
                  onChange={onProviderAccountChange}
                  disabled={disabled || providerAccountSelectionLocked}
                  unavailableReason={providerAccountSelectionBlockedReason}
                />
              )}
              {selection.providerId === 'codex' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  role="switch"
                  aria-checked={codexFastMode}
                  aria-label="Fast mode"
                  title={
                    codexFastMode
                      ? 'Fast mode is on'
                      : 'Fast mode is off; Codex will use the default service tier.'
                  }
                  onClick={() => onCodexFastModeChange(!codexFastMode)}
                  disabled={disabled || selectionDisabled}
                  className={cn(
                    'h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground',
                    codexFastMode && 'bg-secondary text-foreground',
                  )}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Fast
                </Button>
              ) : null}
              {armedOutgoingRelays > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  role="switch"
                  aria-checked={relaysMuted}
                  aria-label="Send quiet"
                  title={relayMuteTitle(relaysMuted, armedOutgoingRelays)}
                  onClick={() => onRelaysMutedChange(!relaysMuted)}
                  disabled={disabled}
                  className={cn(
                    'h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground',
                    relaysMuted && 'bg-secondary text-foreground',
                  )}
                >
                  {relaysMuted ? (
                    <BellOff className="h-3.5 w-3.5" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  )}
                  Quiet
                </Button>
              ) : null}
              {!selectionDisabled ? (
                <>
                  <ComposerSelect
                    selectedId={simplePermissionPreset}
                    value={
                      permissionConfig.preset === 'custom'
                        ? 'Custom'
                        : simplePermissionPreset === 'yolo'
                          ? 'Yolo'
                          : 'Ask'
                    }
                    items={permissionItems}
                    onChange={(id) =>
                      onPermissionPresetChange(id === 'yolo' ? 'yolo' : 'ask')
                    }
                    disabled={disabled || !selection.provider}
                    className="px-2 text-xs text-muted-foreground hover:text-foreground"
                  />
                  {canCustomizePermissions ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={cn(
                        'h-7 w-7 text-muted-foreground hover:text-foreground',
                        permissionAdvancedOpen &&
                          'bg-secondary text-foreground',
                      )}
                      aria-label="Advanced permission controls"
                      aria-pressed={permissionAdvancedOpen}
                      onClick={() =>
                        onPermissionAdvancedOpenChange(!permissionAdvancedOpen)
                      }
                      disabled={disabled || !selection.provider}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  ) : selection.providerId === 'pi' ? (
                    <span className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      Provider-managed
                    </span>
                  ) : null}
                </>
              ) : null}
              {usagePill}
              {contextWindowDot}
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
                  {modeLabels[visibleDeliveryModes[0]] ??
                    visibleDeliveryModes[0]}
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
          {permissionAdvancedOpen && canCustomizePermissions ? (
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
              {selection.providerId === 'codex' ? (
                <>
                  <ComposerSelect
                    selectedId={codexConfig.approvalPolicy}
                    value={
                      CODEX_APPROVAL_POLICY_OPTIONS.find(
                        (item) => item.id === codexConfig.approvalPolicy,
                      )?.label ?? 'Approval policy'
                    }
                    items={CODEX_APPROVAL_POLICY_OPTIONS}
                    onChange={(id) =>
                      onCodexApprovalPolicyChange(id as CodexApprovalPolicy)
                    }
                    disabled={disabled}
                    className="px-2 text-xs text-muted-foreground hover:text-foreground"
                  />
                  <ComposerSelect
                    selectedId={codexConfig.sandbox}
                    value={
                      CODEX_SANDBOX_OPTIONS.find(
                        (item) => item.id === codexConfig.sandbox,
                      )?.label ?? 'Sandbox'
                    }
                    items={CODEX_SANDBOX_OPTIONS}
                    onChange={(id) =>
                      onCodexSandboxChange(id as CodexSandboxMode)
                    }
                    disabled={disabled}
                    className="px-2 text-xs text-muted-foreground hover:text-foreground"
                  />
                </>
              ) : (
                <ComposerSelect
                  selectedId={claudeCodeConfig.permissionMode}
                  value={
                    CLAUDE_CODE_PERMISSION_MODE_OPTIONS.find(
                      (item) => item.id === claudeCodeConfig.permissionMode,
                    )?.label ?? 'Permission mode'
                  }
                  items={CLAUDE_CODE_PERMISSION_MODE_OPTIONS}
                  onChange={(id) =>
                    onClaudeCodePermissionModeChange(
                      id as ClaudeCodePermissionMode,
                    )
                  }
                  disabled={disabled}
                  className="px-2 text-xs text-muted-foreground hover:text-foreground"
                />
              )}
            </div>
          ) : null}
        </div>
        <ExecutionBar
          view={executionBar}
          disabled={disabled || selectionDisabled}
          onChange={onExecutionHostChange}
        />
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        ⌘ + Enter to send
      </p>
    </div>
  )
}
