import { ProviderIcon } from '@/entities/provider'
import { useId } from 'react'
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
  ReasoningEffort,
  ResolvedProviderSelection,
  SessionPermissionConfig,
  CodexApprovalPolicy,
  CodexSandboxMode,
  ClaudeCodePermissionMode,
  OptionRowCatalog,
  ProviderCatalogEntry,
} from '@/entities/session'
import {
  CLAUDE_CODE_PERMISSION_MODE_OPTIONS,
  CODEX_APPROVAL_POLICY_OPTIONS,
  CODEX_SANDBOX_OPTIONS,
  effortSelectItems,
  getSimplePermissionPreset,
  providerSelectItems,
  scopeModelCatalogToProvider,
  selectableProviderDescriptors,
} from '@/entities/session'
import { AttachmentsRow, type Attachment } from '@/entities/attachment'
import type { ProjectContextItem } from '@/entities/project-context'
import type { PromptLibraryEntry } from '@/entities/prompt-library'
import type { SkillCatalogEntry, SkillSelection } from '@/entities/skill'
import type { ComposerInjectionRootItem } from './composer-injection-trigger.pure'
import { ModelPickerDialog } from '@/features/model-picker'
import {
  Badge,
  Button,
  Chip,
  ComposerCard,
  Kbd,
  IconButton,
  listboxOptionId,
  listboxStep,
  MetaLine,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  SegmentedControlItem,
  StatusPill,
  Textarea,
  Toggle,
  Tooltip,
} from '@convergence/ui'
import {
  ArrowUp,
  Bell,
  BellOff,
  FileText,
  Paperclip,
  Plus,
  Repeat,
  SlidersHorizontal,
  Zap,
} from 'lucide-react'
import { CatalogNotice } from './catalog-notice.presentational'
import { composerAttachedRow, composerToolbarControl } from './composer.styles'
import { ComposerCombobox } from './composer-combobox.presentational'
import {
  ComposerSelect,
  type ComposerSelectItem,
} from './composer-select.presentational'
import { ExecutionBar } from './execution-bar.presentational'
import { SUBMIT_SHORTCUT_LABEL } from '@/shared/lib/use-form-submit-shortcut.pure'
import type { ExecutionBarView } from './execution-bar.pure'
import type { WorkAddressSlotView } from '@/entities/execution-host'
import { composerCanSend } from './composer-send.pure'
import {
  composerDrivenList,
  composerKeyedPicker,
  type ComposerPickerKind,
  type ComposerPickers,
} from './composer-pickers.pure'
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
import {
  ComposerAccountNotice,
  type ComposerAccountNoticeState,
} from './composer-account-notice.presentational'

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /**
   * The whole option row as one value (MAR-2682): the machine's own catalog
   * with its blocked entries still in it, or the sentence that stands in its
   * place, and in either case whatever the machine could not confirm.
   *
   * One prop and not a list beside a loose sentence. "Replace the controls" and
   * "stand beside them" are different renders, and deriving which from an entry
   * count would be a proxy for the question rather than the question — a
   * surviving listing the daemon could not re-confirm is exactly the case where
   * the count says list and the honest answer is *list, and say so*.
   */
  optionRow: OptionRowCatalog
  selection: ResolvedProviderSelection
  onProviderChange: (id: string) => void
  onModelChange: (id: string, providerId?: string) => void
  onEffortChange: (id: ReasoningEffort | '') => void
  providerAccounts: ProviderAccount[]
  selectedProviderAccountId: string | null
  onProviderAccountChange: (accountId: string | null) => void
  /** Controlled by the composer so the Actions menu can open it (MAR-3393). */
  providerAccountPickerOpen?: boolean
  onProviderAccountPickerOpenChange?: (open: boolean) => void
  providerAccountSelectionLocked: boolean
  providerAccountPickerVisible?: boolean
  providerAccountAmbientDisabledReason?: string
  providerAccountAmbientIsCurrent?: boolean
  providerAccountHelp?: string
  accountNotice?: ComposerAccountNoticeState
  onManageProviderAccounts?: () => void
  /**
   * The Codex speeds this account is offered for the chosen model, Standard
   * first (MAR-3574). Built from the account's own list, never hard-coded.
   */
  codexSpeedChoices: Array<{
    id: string
    label: string
    description: string | null
  }>
  /** The chosen speed's id: `default` (Standard), `priority`, `ultrafast`. */
  codexSpeedId: string
  onCodexSpeedChange: (speedId: string) => void
  /**
   * Whether this composer governs the local Codex CLI's own billing (MAR-2682).
   * Derived from the machine as well as the provider, because `serviceTier`
   * never crosses the execution-host wire: on a daemon the switch could only
   * pretend.
   */
  codexBillingControlsAvailable: boolean
  executionBar: ExecutionBarView
  onExecutionHostChange: (hostId: string) => void
  workAddress: WorkAddressSlotView
  onWorkAddressChange: (choiceId: string) => void
  onWorkAddressBranchChange: (branch: string) => void
  /**
   * Armed wires leaving this session (F10). Zero renders no control at all --
   * a switch that silences nothing is noise on every other composer.
   */
  armedOutgoingRelays: number
  /** Widget-owned disclosure, also visible when every wire is disarmed. */
  wiresSlot?: ReactNode
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
  /**
   * The line above both skill lists when this row's machine is not this Mac.
   * Null on this Mac, including a global draft forced to stay here.
   */
  remoteSkillsNotice: string | null
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
  /** What follows `::skill::`, so an empty list says which kind of empty. */
  skillInjectionQuery?: string
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

const NO_CATALOG_ENTRIES: readonly ProviderCatalogEntry[] = []

export const Composer: FC<ComposerProps> = ({
  value,
  onChange,
  onSubmit,
  optionRow,
  selection,
  onProviderChange,
  onModelChange,
  onEffortChange,
  providerAccounts,
  selectedProviderAccountId,
  onProviderAccountChange,
  providerAccountPickerOpen,
  onProviderAccountPickerOpenChange,
  providerAccountSelectionLocked,
  providerAccountPickerVisible,
  providerAccountAmbientDisabledReason,
  providerAccountAmbientIsCurrent,
  providerAccountHelp,
  accountNotice,
  onManageProviderAccounts,
  codexSpeedChoices,
  codexSpeedId,
  onCodexSpeedChange,
  codexBillingControlsAvailable,
  executionBar,
  onExecutionHostChange,
  workAddress,
  onWorkAddressChange,
  onWorkAddressBranchChange,
  wiresSlot,
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
  placeholder = 'Ask anything, @tag files/folders, :: for injections…',
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
  remoteSkillsNotice,
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
  skillInjectionQuery = '',
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
  // The `::` and `@` pickers' lists (MAR-3616 DS3e): the message field drives
  // whichever one is showing rows, naming it (aria-controls) and its active
  // row (aria-activedescendant), so a screen reader hears the row the arrows
  // reach while the caret stays in the message. Which one, and which takes
  // the keys, is composer-pickers.pure.ts's (CONV-30).
  const pickerListId = useId()
  const pickerLists: Record<ComposerPickerKind, string> = {
    root: `${pickerListId}-injections`,
    mention: `${pickerListId}-context`,
    skill: `${pickerListId}-skills`,
    prompt: `${pickerListId}-prompts`,
  }
  const pickers: ComposerPickers = {
    root: {
      open: rootInjectionPickerOpen,
      count: rootInjectionItems.length,
      active: rootInjectionHighlightedIndex,
    },
    mention: {
      open: projectContextEnabled && mentionPickerOpen,
      count: mentionItems.length,
      active: mentionHighlightedIndex,
    },
    skill: {
      open: skillInjectionPickerOpen,
      count: skillInjectionItems.length,
      active: skillInjectionHighlightedIndex,
      waiting: Boolean(skillCatalogError) || skillCatalogLoading,
    },
    prompt: {
      open: promptInjectionPickerOpen,
      count: promptInjectionItems.length,
      active: promptInjectionHighlightedIndex,
      waiting: Boolean(promptInjectionError) || promptInjectionLoading,
    },
  }
  const drivenList = composerDrivenList(pickers)
  // The choices always carry the chosen tier (MAR-3574), so the label never
  // falls back to a speed the next turn is not running at.
  const codexSpeedLabel =
    codexSpeedChoices.find((choice) => choice.id === codexSpeedId)?.label ??
    codexSpeedId
  // One derivation, read by the button and by ⌘↵ alike (MAR-2689, CONV-30).
  const canSend = composerCanSend({
    disabled,
    optionRow,
    workAddress,
    hasAttachmentErrors,
    attachmentsIngestInFlight,
    value,
    attachmentCount: attachments.length,
    hasPendingAnnotations,
  })

  /** What each picker does with the field's keys: its rows by index. */
  const pickerKeyActions: Record<
    ComposerPickerKind,
    {
      hover?: (index: number) => void
      pick: (index: number) => void
      dismiss?: () => void
    }
  > = {
    root: {
      hover: onRootInjectionHover,
      pick: (index) => {
        const item = rootInjectionItems[index]
        if (item) onRootInjectionSelect?.(item)
      },
      dismiss: onRootInjectionDismiss,
    },
    mention: {
      hover: onMentionHover,
      pick: (index) => {
        const item = mentionItems[index]
        if (item) onMentionSelect?.(item)
      },
      dismiss: onMentionDismiss,
    },
    skill: {
      hover: onSkillInjectionHover,
      pick: (index) => {
        const skill = skillInjectionItems[index]
        if (skill) onSkillInjectionSelect?.(skill)
      },
      dismiss: onSkillInjectionDismiss,
    },
    prompt: {
      hover: onPromptInjectionHover,
      pick: (index) => {
        const prompt = promptInjectionItems[index]
        if (prompt) onPromptInjectionSelect?.(prompt)
      },
      dismiss: onPromptInjectionDismiss,
    },
  }
  const keyedPicker = composerKeyedPicker(pickers)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (keyedPicker) {
      const keys = pickerKeyActions[keyedPicker.kind]
      // Escape dismisses; the arrows (and Home, End, Control-N and -P) move
      // the active row, wrapping round the ends, as every Listbox the field
      // drives does; Enter picks it. ⌘↵ still sends.
      if (e.key === 'Escape') {
        e.preventDefault()
        keys.dismiss?.()
        return
      }
      const next = listboxStep(
        keyedPicker.active >= 0 ? keyedPicker.active : null,
        keyedPicker.count,
        e,
      )
      if (next !== undefined) {
        e.preventDefault()
        keys.hover?.(next)
        return
      }
      if (
        e.key === 'Enter' &&
        !e.metaKey &&
        !e.ctrlKey &&
        keyedPicker.count > 0
      ) {
        e.preventDefault()
        keys.pick(keyedPicker.active)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (canSend) onSubmit()
    }
  }

  // What the row has to fill its controls from. A `notice` row has none, which
  // is why it renders a sentence instead of an emptied cluster.
  const providerCatalog =
    optionRow.status === 'listed' ? optionRow.entries : NO_CATALOG_ENTRIES
  // Listed and disabled, never dropped: a machine that will not run a provider
  // teaches more by saying so than by having no row at all (MAR-2682, "a
  // blocked provider is listed and disabled, never dropped" -- the same
  // treatment the strip beneath already gives). The fork dialog lists them
  // from the same mapping (CONV-17); the mark is drawn here.
  const providerItems = providerSelectItems(providerCatalog).map(
    (item): ComposerSelectItem => ({
      id: item.id,
      label: item.label,
      description: item.description,
      disabled: item.disabled,
      choice: (
        <span className="flex min-w-0 items-center gap-2">
          <ProviderIcon
            providerId={item.id}
            vendorLabel={item.vendorLabel}
            name={item.name}
          />
          <span className="truncate">{item.label}</span>
          {item.badge ? (
            <Tooltip label={item.badge.title}>
              <Badge tone="warning" shape="label">
                {item.badge.label}
              </Badge>
            </Tooltip>
          ) : null}
        </span>
      ),
    }),
  )
  // The same derivation the container resolves selections through, so the model
  // dialog can never offer a provider the select refuses to hand out.
  const providers = selectableProviderDescriptors(providerCatalog)
  // An existing session may move between its own provider's models and no
  // further (MAR-2550). A draft keeps the whole catalog.
  const modelCatalogProviders = scopeModelCatalogToProvider(
    providers,
    sessionProviderId,
  )
  // A stranded session has no catalog model to read options from, but its row
  // still carries an effort. Showing it, disabled, beats hiding the control and
  // leaving the human to guess what the row says (MAR-2550).
  const effortItems = effortSelectItems(selection)
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

  const modeLabels: Partial<Record<MidRunInputMode, string>> = {
    answer: 'Answer',
    'follow-up': 'Follow-up',
    steer: 'Steer',
  }
  const visibleDeliveryModes = deliveryModes.filter((mode) => mode !== 'normal')

  return (
    <div className="mx-auto w-full max-w-conversation">
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
        <ComposerCard
          dragging={isDragging}
          // The card is the upper of two stacked surfaces: the Execution Bar
          // is its sibling below, tucked behind this bottom edge.
          className={composerCardDepthClassByMode[executionBar.mode]}
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
              className={composerAttachedRow}
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
              className={composerAttachedRow}
              data-testid="selected-project-context-row"
            >
              {selectedContextItems.map((item) => {
                const label = item.label?.trim() ? item.label : 'Untitled'
                return (
                  <Chip
                    key={item.id}
                    icon={<FileText />}
                    onRemove={() => onContextRemove(item.id)}
                    removeLabel={`Remove ${label} context`}
                  >
                    {label}
                  </Chip>
                )
              })}
            </div>
          ) : null}
          {projectContextEnabled && everyTurnContextCount > 0 ? (
            <div className="mb-2">
              <Tooltip label="Every-turn project context items are re-sent on every message in this session.">
                <StatusPill
                  tone="warning"
                  leading={<Repeat aria-hidden className="size-3" />}
                  className="font-medium"
                  data-testid="every-turn-context-badge"
                >
                  {/* Its facts on a MetaLine (CONV-23). */}
                  <MetaLine>
                    Every-turn context active
                    {`${everyTurnContextCount} item${everyTurnContextCount === 1 ? '' : 's'}`}
                  </MetaLine>
                </StatusPill>
              </Tooltip>
            </div>
          ) : null}
          <div className="relative">
            <ComposerInjectionRootPicker
              listId={pickerLists.root}
              open={rootInjectionPickerOpen}
              items={rootInjectionItems}
              highlightedIndex={rootInjectionHighlightedIndex}
              onSelect={(item) => onRootInjectionSelect?.(item)}
              onHover={(index) => onRootInjectionHover?.(index)}
            />
            <ComposerContextMentionPicker
              listId={pickerLists.mention}
              open={projectContextEnabled && mentionPickerOpen}
              items={mentionItems}
              highlightedIndex={mentionHighlightedIndex}
              onSelect={(item) => onMentionSelect?.(item)}
              onHover={(index) => onMentionHover?.(index)}
            />
            <ComposerSkillInjectionPicker
              listId={pickerLists.skill}
              open={skillInjectionPickerOpen}
              items={skillInjectionItems}
              query={skillInjectionQuery}
              selectedSkills={selectedSkills}
              highlightedIndex={skillInjectionHighlightedIndex}
              activeProviderLabel={selection.providerLabel}
              isLoading={skillCatalogLoading}
              error={skillCatalogError}
              notice={remoteSkillsNotice}
              onSelect={(skill) => onSkillInjectionSelect?.(skill)}
              onHover={(index) => onSkillInjectionHover?.(index)}
            />
            <ComposerPromptInjectionPicker
              listId={pickerLists.prompt}
              open={promptInjectionPickerOpen}
              items={promptInjectionItems}
              highlightedIndex={promptInjectionHighlightedIndex}
              isLoading={promptInjectionLoading}
              error={promptInjectionError}
              onSelect={(prompt) => onPromptInjectionSelect?.(prompt)}
              onHover={(index) => onPromptInjectionHover?.(index)}
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
              onPaste={onPaste}
              placeholder={placeholder}
              // Named, because the strip below now has a text field of its own
              // (the branch, MAR-2694) and "the textbox" stopped being one
              // thing. An input a reader cannot name is also an accessibility
              // defect on its own terms.
              aria-label="Message"
              aria-autocomplete={drivenList ? 'list' : undefined}
              aria-controls={
                drivenList ? pickerLists[drivenList.kind] : undefined
              }
              aria-activedescendant={
                drivenList
                  ? listboxOptionId(
                      pickerLists[drivenList.kind],
                      drivenList.active,
                    )
                  : undefined
              }
              disabled={disabled}
              // It grows with what's typed, to nine lines (the 200 px it
              // grew to by hand), then scrolls; cleared, it shrinks back
              // (CONV-17).
              autoGrow
              maxRows={9}
              rows={1}
              variant="bare"
              className="text-ink"
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              <Popover
                onOpenChange={(open, details) => {
                  // A picker opened from here lives in its own popover: a
                  // press inside it is outside this one, and must not close
                  // it underneath the picker.
                  if (
                    !open &&
                    details.reason === 'outside-press' &&
                    (skillPickerOpen || contextPickerOpen)
                  )
                    details.cancel()
                }}
              >
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="quiet"
                      aria-label="Add composer resources"
                      disabled={disabled}
                      size="sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                      {resourceCount > 0 ? (
                        <Badge shape="count">{resourceCount}</Badge>
                      ) : null}
                    </Button>
                  }
                />
                <PopoverContent
                  aria-label="Resources"
                  align="start"
                  className="w-56 p-1"
                >
                  <div className="px-2 py-1.5 text-xs font-medium text-ink-muted">
                    Resources
                  </div>
                  <Button
                    type="button"
                    variant="quiet"
                    aria-label="Add attachment"
                    onClick={onAttachmentAdd}
                    disabled={attachmentsIngestInFlight}
                    className="w-full justify-start"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Attach file
                    {attachments.length > 0 ? (
                      <Badge shape="count" className="ml-auto">
                        {attachments.length}
                      </Badge>
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
                    notice={remoteSkillsNotice}
                    disabled={!selection.provider}
                    triggerClassName="w-full justify-start"
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
                      triggerClassName="w-full justify-start"
                      onToggleItem={onContextToggle}
                    />
                  ) : null}
                </PopoverContent>
              </Popover>
              {/*
                Provider, model, effort, account, the provider-specific toggles
                and the permission preset are one cluster because they are one
                thing: what the machine named beneath this row can be asked to
                do, and how freely (MAR-2682).
                While a remote machine has not answered there is nothing honest
                to put here, so the cluster is not disabled — it is not
                rendered, and a sentence naming the machine stands in its place.
                "Not yet known" and "local" have to look different, and the
                surest way for them to look different is for one of them to have
                no controls at all.
              */}
              {optionRow.status === 'notice' ? (
                <CatalogNotice notice={optionRow.notice} />
              ) : (
                <>
                  {/*
                    A listing the machine could not re-confirm is shown — a blip
                    must not empty a row that was right a second ago — but never
                    without saying so, and it says so *first*, before the
                    controls it qualifies (MAR-2682, "a dead daemon must not
                    look alive").
                  */}
                  {optionRow.notice ? (
                    <CatalogNotice notice={optionRow.notice} />
                  ) : null}
                  {/*
                    The provider and the effort are a few fixed choices, so
                    Selects (R9, ruling 12), as the fork's are.
                  */}
                  <ComposerSelect
                    label="Provider"
                    selectedId={selection.providerId}
                    placeholder="Select provider"
                    fallback={selection.providerLabel}
                    items={providerItems}
                    onChange={onProviderChange}
                    disabled={selectionDisabled}
                  />
                  <ModelPickerDialog
                    providers={modelCatalogProviders}
                    selectedProviderId={selection.providerId}
                    selectedModelId={selection.modelId}
                    value={
                      selection.model?.label ||
                      selection.modelId ||
                      'Select model'
                    }
                    onChange={(providerId, modelId) =>
                      onModelChange(modelId, providerId)
                    }
                    disabled={modelSelectionDisabled || !selection.provider}
                    label="Model"
                    triggerVariant="ghost"
                    triggerSize="sm"
                    triggerClassName={composerToolbarControl}
                  />
                  {effortItems.length > 0 && (
                    <ComposerSelect
                      label="Reasoning effort"
                      selectedId={selection.effortId}
                      placeholder="Select effort"
                      fallback={selection.effort?.label}
                      items={effortItems}
                      onChange={(id) => onEffortChange(id as ReasoningEffort)}
                      disabled={modelSelectionDisabled || !selection.model}
                    />
                  )}
                  {(providerAccountPickerVisible ??
                    selection.providerId === 'claude-code') && (
                    <ProviderAccountPicker
                      accounts={providerAccounts}
                      providerName={selection.provider?.name}
                      ambientDisabledReason={
                        providerAccountAmbientDisabledReason
                      }
                      help={providerAccountHelp}
                      ambientIsCurrent={providerAccountAmbientIsCurrent}
                      onManageAccounts={onManageProviderAccounts}
                      selectedAccountId={selectedProviderAccountId}
                      onChange={onProviderAccountChange}
                      disabled={disabled || providerAccountSelectionLocked}
                      open={providerAccountPickerOpen}
                      onOpenChange={onProviderAccountPickerOpenChange}
                    />
                  )}
                  {/*
                    Gone on a daemon, not disabled: the speed writes
                    `serviceTier`, which has no home on the wire, so a choice
                    there would set a field the machine below never receives
                    (MAR-2682). Locked like the model and effort, not like the
                    provider: a speed change reaches the conversation's next
                    turn, so it is only held while a turn is in flight
                    (MAR-3572). Its rows are the account's own offer (MAR-3574).
                    It shows its value like every other picker, without a tint
                    of its own for "not Standard": that was the old "on" look
                    typed by hand, and R7's chosen look belongs to toggles
                    (ruling 11, CONV-14).
                  */}
                  {codexBillingControlsAvailable ? (
                    <ComposerCombobox
                      label="Speed"
                      size="sm"
                      selectedId={codexSpeedId}
                      value={codexSpeedLabel}
                      items={codexSpeedChoices.map((choice) => ({
                        id: choice.id,
                        label: choice.label,
                        ...(choice.description
                          ? { description: choice.description }
                          : {}),
                      }))}
                      icon={<Zap className="h-3.5 w-3.5" />}
                      onChange={onCodexSpeedChange}
                      disabled={disabled || modelSelectionDisabled}
                      className={composerToolbarControl}
                    />
                  ) : null}
                  {/*
                    Ask/Yolo lives in the cluster because it is the same kind of
                    claim: what the provider on the machine below may do without
                    asking. It used to hang off `selectionDisabled` alone, so
                    while a daemon had not answered the row emptied of provider,
                    model, effort and account and left a permission preset
                    standing over nothing -- two comboboxes where only the strip
                    belongs (MAR-2682). Inside the branch rather than beside it
                    with a second condition: one gate for the whole cluster is
                    one place to be wrong, and the wrong form is no longer
                    available to write.
                  */}
                  {!selectionDisabled ? (
                    <>
                      <ComposerCombobox
                        label="Permissions"
                        size="sm"
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
                          onPermissionPresetChange(
                            id === 'yolo' ? 'yolo' : 'ask',
                          )
                        }
                        disabled={disabled || !selection.provider}
                        className={composerToolbarControl}
                      />
                      {canCustomizePermissions ? (
                        <IconButton
                          label="Advanced permission controls"
                          type="button"
                          variant="quiet"
                          pressed={permissionAdvancedOpen}
                          onClick={() =>
                            onPermissionAdvancedOpenChange(
                              !permissionAdvancedOpen,
                            )
                          }
                          disabled={disabled || !selection.provider}
                          size="sm"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </IconButton>
                      ) : selection.providerId === 'pi' ? (
                        <Badge shape="label">Provider-managed</Badge>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
              {armedOutgoingRelays > 0 ? (
                <Tooltip
                  label={relayMuteTitle(relaysMuted, armedOutgoingRelays)}
                >
                  <Toggle
                    size="sm"
                    pressed={relaysMuted}
                    aria-label="Send quiet"
                    onPressedChange={(muted) => onRelaysMutedChange(muted)}
                    disabled={disabled}
                  >
                    {relaysMuted ? (
                      <BellOff className="h-3.5 w-3.5" />
                    ) : (
                      <Bell className="h-3.5 w-3.5" />
                    )}
                    Quiet
                  </Toggle>
                </Tooltip>
              ) : null}
              {wiresSlot}
              {usagePill}
              {contextWindowDot}
              {visibleDeliveryModes.length > 1 ? (
                <SegmentedControl
                  aria-label="Delivery mode"
                  size="xs"
                  value={deliveryMode}
                  onValueChange={(mode) =>
                    onDeliveryModeChange(mode as MidRunInputMode)
                  }
                  disabled={disabled}
                >
                  {visibleDeliveryModes.map((mode) => (
                    <SegmentedControlItem key={mode} value={mode}>
                      {modeLabels[mode] ?? mode}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              ) : visibleDeliveryModes.length === 1 ? (
                <Badge shape="label">
                  {modeLabels[visibleDeliveryModes[0]] ??
                    visibleDeliveryModes[0]}
                </Badge>
              ) : null}
            </div>
            <IconButton
              label="Send message"
              type="button"
              disabled={!canSend}
              onClick={onSubmit}
              className="rounded-full"
            >
              <ArrowUp className="h-4 w-4" />
            </IconButton>
          </div>
          {accountNotice ? (
            <div className="mt-3 border-t border-line-soft pt-3">
              <ComposerAccountNotice
                notice={accountNotice}
                onManageAccounts={onManageProviderAccounts}
              />
            </div>
          ) : null}
          {/*
            The panel the advanced button opens, held to the same rule as the
            button: a row with no answer from its machine shows no local control
            (MAR-2682). It is not enough that the button is gone. This panel is
            open/closed component state, and a session born from a draft that
            had it open keeps it open -- so a stranded session on a machine
            still being asked would render a Codex approval policy and sandbox
            beneath a sentence saying the daemon has not answered.
          */}
          {optionRow.status !== 'notice' &&
          permissionAdvancedOpen &&
          canCustomizePermissions ? (
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line-soft pt-2">
              {selection.providerId === 'codex' ? (
                <>
                  <ComposerCombobox
                    label="Approval policy"
                    size="sm"
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
                    className={composerToolbarControl}
                  />
                  <ComposerCombobox
                    label="Sandbox"
                    size="sm"
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
                    className={composerToolbarControl}
                  />
                </>
              ) : (
                <ComposerCombobox
                  label="Permission mode"
                  size="sm"
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
                  className={composerToolbarControl}
                />
              )}
            </div>
          ) : null}
        </ComposerCard>
        <ExecutionBar
          view={executionBar}
          workAddress={workAddress}
          disabled={disabled || selectionDisabled}
          onChange={onExecutionHostChange}
          onWorkAddressChange={onWorkAddressChange}
          onWorkAddressBranchChange={onWorkAddressBranchChange}
        />
      </div>
      <p className="mt-1.5 text-center text-3xs text-ink-muted">
        {/* The key the field sends on, formatted for this platform (DS-34). */}
        <Kbd>{SUBMIT_SHORTCUT_LABEL}</Kbd> to send
      </p>
    </div>
  )
}
