import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC } from 'react'
import {
  describeUnavailableProviderSelection,
  type MidRunInputMode,
  resolveComposerSelectionLocks,
  resolveProviderSelection,
  resolveSessionModelSelectionWrite,
  type SessionQueuedInput,
  useSessionStore,
  type ReasoningEffort,
  type SessionSummary,
  type SessionPermissionConfig,
  defaultCustomPermissionConfigForProvider,
  resolveSimplePermissionConfig,
  withClaudeCodePermissionMode,
  withCodexApprovalPolicy,
  withCodexSandbox,
} from '@/entities/session'
import {
  resolveMidRunInputPolicy,
  selectLatestAgentMessageId,
} from '@/entities/session'
import {
  compileAnnotationsIntoPrompt,
  selectPendingAnnotations,
  useResponseAnnotationStore,
  useSessionAnnotations,
} from '@/entities/response-annotation'
import { useAppSettingsStore } from '@/entities/app-settings'
import { LOCAL_EXECUTION_HOST_ID } from '@/entities/execution-host'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useDialogStore } from '@/entities/dialog'
import {
  describeProviderAccountSelectionBlock,
  isProviderAccountSelectionLocked,
  providerAccountsForProvider,
  providerAccountApi,
  resolveInitialProviderAccountSelection,
  type ProviderAccount,
} from '@/entities/provider-account'
import { turnsApi } from '@/entities/turn'
import {
  findProviderQuotaSnapshot,
  providerQuotaApi,
  type ProviderQuotaSnapshot,
} from '@/entities/provider-quota'
import {
  AttachmentPreviewContainer,
  useAttachmentDraft,
  resolveAttachmentCapabilityForModel,
  validateAttachmentsAgainstCapability,
  type Attachment,
} from '@/entities/attachment'
import {
  skillSelectionFromCatalogEntry,
  useSkillStore,
  type SkillCatalogEntry,
  type SkillSelection,
} from '@/entities/skill'
import {
  filterContextMentions,
  useProjectContextStore,
  type ProjectContextItem,
} from '@/entities/project-context'
import {
  usePromptLibraryStore,
  type PromptLibraryEntry,
} from '@/entities/prompt-library'
import { Composer } from './composer.presentational'
import {
  filterComposerSkills,
  filterSelectionsForProvider,
} from './composer-skill-picker.pure'
import {
  detectComposerInjectionTrigger,
  filterComposerInjectionRootItems,
  replaceComposerInjectionRange,
  type ComposerInjectionRootItem,
} from './composer-injection-trigger.pure'
import { countArmedOutgoingRelays } from './relay-mute.pure'
import { filterComposerPrompts } from './composer-prompt-injection.pure'
import {
  executionHostForNewSession,
  resolveExecutionBarView,
} from './execution-bar.pure'
import { CodexUsagePillContainer } from './codex-usage-pill.container'
import { shouldShowCodexUsagePill } from './codex-usage-pill.pure'
import { ContextWindowDot } from './context-window-dot.container'
import { Button } from '@/shared/ui/button'
import { X } from 'lucide-react'

export type ComposerSessionContext =
  | {
      kind: 'project'
      projectId: string
      workspaceId: string | null
      activeSessionId: string | null
    }
  | {
      kind: 'global'
      activeSessionId: string | null
    }

interface ComposerContainerProps {
  context: ComposerSessionContext
  onGlobalSessionCreated?: (session: SessionSummary) => void | Promise<void>
  prepareNewSessionMessage?: (message: string) => string
}

const DRAFT_KEY_NEW = '__new__'
const EMPTY_QUEUED_INPUTS: SessionQueuedInput[] = []
const EMPTY_PROJECT_CONTEXT_ITEMS: ProjectContextItem[] = []

const QUEUED_INPUT_STATE_LABELS: Record<SessionQueuedInput['state'], string> = {
  queued: 'Queued',
  dispatching: 'Dispatching',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const DELIVERY_MODE_LABELS: Partial<Record<MidRunInputMode, string>> = {
  'follow-up': 'Follow-up',
  steer: 'Steer',
  interrupt: 'Interrupt',
}

function getComposerContextKey(context: ComposerSessionContext): string {
  if (context.kind === 'project') {
    return `project:${context.projectId}:${context.workspaceId ?? 'main'}`
  }
  return 'global'
}

function getQueuedInputPreview(input: SessionQueuedInput): string {
  const text = input.text.trim()
  if (text) return text
  if (input.attachmentIds.length === 1) return '1 attachment'
  if (input.attachmentIds.length > 1)
    return `${input.attachmentIds.length} attachments`
  return 'Empty input'
}

export const ComposerContainer: FC<ComposerContainerProps> = ({
  context,
  onGlobalSessionCreated,
  prepareNewSessionMessage,
}) => {
  const activeSessionId = context.activeSessionId
  const projectId = context.kind === 'project' ? context.projectId : null
  const projectContextEnabled = context.kind === 'project'
  const contextKey = getComposerContextKey(context)
  const [value, setValue] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [effortId, setEffortId] = useState<ReasoningEffort | ''>('')
  const [codexFastMode, setCodexFastMode] = useState(false)
  const [providerAccounts, setProviderAccounts] = useState<ProviderAccount[]>(
    [],
  )
  const [selectedProviderAccountId, setSelectedProviderAccountId] = useState<
    string | null
  >(null)
  /**
   * The machine he last picked for a session being born (MAR-2642).
   *
   * An id, never a boolean: a boolean could say "somewhere else" but not
   * which somewhere, and a session has to record the machine it ran on. Held
   * raw and clamped at the read by `resolveExecutionBarView`, so an Endpoint
   * removed in Settings or a provider the daemon cannot run demotes the send
   * to local without erasing the pick he made.
   */
  const [selectedExecutionHostId, setSelectedExecutionHostId] = useState(
    LOCAL_EXECUTION_HOST_ID,
  )
  /**
   * The quiet send (F10). Per send and never sticky: it is switched back off
   * the moment the message leaves, because a session bound to a flow is meant
   * to fire and the exception is the gesture.
   */
  const [relaysMuted, setRelaysMuted] = useState(false)
  const [permissionConfig, setPermissionConfig] =
    useState<SessionPermissionConfig>(resolveSimplePermissionConfig('ask'))
  const [permissionAdvancedOpen, setPermissionAdvancedOpen] = useState(false)
  const [deliveryMode, setDeliveryMode] = useState<MidRunInputMode>('normal')
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(
    null,
  )
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [contextPickerOpen, setContextPickerOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<SkillSelection[]>([])
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([])
  const [codexUsageSnapshot, setCodexUsageSnapshot] =
    useState<ProviderQuotaSnapshot | null>(null)
  const [codexUsageLoading, setCodexUsageLoading] = useState(false)
  const providers = useSessionStore((s) => s.providers)
  const openDialog = useDialogStore((s) => s.open)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const createAndStartSession = useSessionStore((s) => s.createAndStartSession)
  const createAndStartGlobalSession = useSessionStore(
    (s) => s.createAndStartGlobalSession,
  )
  const sendMessageToSession = useSessionStore((s) => s.sendMessageToSession)
  /**
   * The whole wire list, narrowed below. Relays are cross-project furniture and
   * the store already holds every one of them, so "does anything leave this
   * session?" costs no IPC. Subscribed whole and filtered in a `useMemo`:
   * filtering inside the selector would hand zustand a fresh array on every
   * render and spin the app (run 16 hit exactly that).
   */
  const relays = useSessionRelayStore((s) => s.relays)
  const compactSessionContext = useSessionStore((s) => s.compactSessionContext)
  const setSessionModelSelection = useSessionStore(
    (s) => s.setSessionModelSelection,
  )
  const cancelQueuedInput = useSessionStore((s) => s.cancelQueuedInput)
  const sessions = useSessionStore((s) => s.sessions)
  const globalChatSessions = useSessionStore((s) => s.globalChatSessions)
  const queuedInputs = useSessionStore((s) =>
    activeSessionId
      ? (s.queuedInputsBySessionId[activeSessionId] ?? EMPTY_QUEUED_INPUTS)
      : EMPTY_QUEUED_INPUTS,
  )
  /**
   * The Session this composer is aimed at.
   *
   * The scoped lists hold the project or chat currently open, which is the
   * whole story when the composer sits under a conversation. Aimed from
   * Mission Control it is not: that Session can belong to a project nobody has
   * opened, and a composer that cannot find its Session silently becomes a
   * "start a new session" composer. `globalSessions` is the all-projects list
   * the app already keeps live, so falling back to it costs nothing and keeps
   * the composer honest about what it is about to do.
   */
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const sessionList = context.kind === 'project' ? sessions : globalChatSessions
  const activeSession =
    sessionList.find((s) => s.id === activeSessionId) ??
    globalSessions.find((s) => s.id === activeSessionId)
  const annotations = useSessionAnnotations(activeSessionId)
  const markPendingAnnotationsAsSent = useResponseAnnotationStore(
    (s) => s.markPendingAsSent,
  )
  /**
   * Which message counts as "the latest" when annotations compile (RA2).
   *
   * Selected rather than subscribed-to wholesale: the conversation array gets
   * a new identity on every streamed token, and the composer must not
   * re-render for each one. This returns a string, so React bails out unless
   * the answer actually changes.
   */
  const latestAgentMessageId = useSessionStore((s) => {
    const conversationSessionId =
      context.kind === 'global'
        ? s.activeGlobalConversationSessionId
        : s.activeConversationSessionId
    // A conversation belonging to some other session says nothing about this
    // one — better no label than a label computed from the wrong transcript.
    if (!activeSessionId || conversationSessionId !== activeSessionId) {
      return null
    }
    return selectLatestAgentMessageId(
      context.kind === 'global'
        ? s.activeGlobalConversation
        : s.activeConversation,
    )
  })
  const pendingAnnotations = useMemo(
    () => selectPendingAnnotations(annotations),
    [annotations],
  )
  const markAnnotationsSent = useCallback(() => {
    if (activeSessionId && pendingAnnotations.length > 0) {
      markPendingAnnotationsAsSent(activeSessionId)
    }
  }, [activeSessionId, markPendingAnnotationsAsSent, pendingAnnotations.length])
  const activeProvider = providers.find(
    (p) => p.id === activeSession?.providerId,
  )
  /**
   * One derived mode, read by the provider select, the model dialog, the
   * effort select and submit alike (MAR-2550).
   *
   * These used to be two independent booleans, and they disagreed about the
   * session whose provider has left the catalog: the provider lock went false
   * and unlocked itself while every write still went to the hidden row.
   */
  const selectionLocks = resolveComposerSelectionLocks(
    providers,
    activeSession ?? null,
  )
  const attachmentsBySessionId = useProjectContextStore(
    (s) => s.attachmentsBySessionId,
  )
  const itemsByProjectId = useProjectContextStore((s) => s.itemsByProjectId)
  const loadProjectContextForSession = useProjectContextStore(
    (s) => s.loadForSession,
  )
  const loadProjectContextForProject = useProjectContextStore(
    (s) => s.loadForProject,
  )
  const everyTurnContextCount = activeSessionId
    ? projectContextEnabled
      ? (attachmentsBySessionId[activeSessionId] ?? []).filter(
          (item) => item.reinjectMode === 'every-turn',
        ).length
      : 0
    : 0
  const projectContextItems =
    projectId && projectContextEnabled
      ? (itemsByProjectId[projectId] ?? EMPTY_PROJECT_CONTEXT_ITEMS)
      : EMPTY_PROJECT_CONTEXT_ITEMS
  const selectedContextItems = useMemo(
    () =>
      projectContextItems.filter((item) =>
        selectedContextIds.includes(item.id),
      ),
    [projectContextItems, selectedContextIds],
  )

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [cursor, setCursor] = useState(0)
  const [rootInjectionHighlightedIndex, setRootInjectionHighlightedIndex] =
    useState(0)
  const [rootInjectionDismissedRange, setRootInjectionDismissedRange] =
    useState<{
      start: number
      end: number
    } | null>(null)
  const [skillInjectionHighlightedIndex, setSkillInjectionHighlightedIndex] =
    useState(0)
  const [skillInjectionDismissedRange, setSkillInjectionDismissedRange] =
    useState<{
      start: number
      end: number
    } | null>(null)
  const [promptInjectionHighlightedIndex, setPromptInjectionHighlightedIndex] =
    useState(0)
  const [promptInjectionDismissedRange, setPromptInjectionDismissedRange] =
    useState<{
      start: number
      end: number
    } | null>(null)
  const [mentionHighlightedIndex, setMentionHighlightedIndex] = useState(0)
  const [mentionDismissedRange, setMentionDismissedRange] = useState<{
    start: number
    end: number
  } | null>(null)
  const pendingCursorRef = useRef<number | null>(null)

  const injectionTrigger = useMemo(
    () => detectComposerInjectionTrigger(value, cursor),
    [value, cursor],
  )
  const rootInjectionTrigger =
    injectionTrigger.open && injectionTrigger.kind === 'root'
      ? injectionTrigger
      : null
  const rootInjectionItems = useMemo(
    () =>
      filterComposerInjectionRootItems({
        query: rootInjectionTrigger?.query ?? '',
        includeContext: projectContextEnabled,
        includePrompt: true,
        includeSkill: true,
      }),
    [projectContextEnabled, rootInjectionTrigger?.query],
  )
  const rootInjectionPickerOpen =
    rootInjectionTrigger !== null &&
    rootInjectionItems.length > 0 &&
    !(
      rootInjectionDismissedRange !== null &&
      rootInjectionDismissedRange.start === rootInjectionTrigger.range.start
    )
  const contextInjectionTrigger =
    injectionTrigger.open && injectionTrigger.kind === 'context'
      ? injectionTrigger
      : null
  const skillInjectionTrigger =
    injectionTrigger.open && injectionTrigger.kind === 'skill'
      ? injectionTrigger
      : null
  const promptInjectionTrigger =
    injectionTrigger.open && injectionTrigger.kind === 'prompt'
      ? injectionTrigger
      : null
  const mentionPickerOpen =
    projectContextEnabled &&
    contextInjectionTrigger !== null &&
    projectContextItems.length > 0 &&
    !(
      mentionDismissedRange !== null &&
      mentionDismissedRange.start === contextInjectionTrigger.range.start
    )
  const mentionItems = useMemo(
    () =>
      mentionPickerOpen
        ? filterContextMentions(
            projectContextItems,
            contextInjectionTrigger?.query ?? '',
          )
        : EMPTY_PROJECT_CONTEXT_ITEMS,
    [mentionPickerOpen, contextInjectionTrigger, projectContextItems],
  )

  useEffect(() => {
    setRootInjectionHighlightedIndex(0)
  }, [rootInjectionPickerOpen ? rootInjectionTrigger?.query : null])

  useEffect(() => {
    if (rootInjectionDismissedRange === null) return
    if (!rootInjectionTrigger) {
      setRootInjectionDismissedRange(null)
      return
    }
    if (
      rootInjectionTrigger.range.start !== rootInjectionDismissedRange.start
    ) {
      setRootInjectionDismissedRange(null)
    }
  }, [rootInjectionDismissedRange, rootInjectionTrigger])

  useEffect(() => {
    setMentionHighlightedIndex(0)
  }, [mentionPickerOpen ? contextInjectionTrigger?.query : null])

  useEffect(() => {
    if (mentionDismissedRange === null) return
    if (!contextInjectionTrigger) {
      setMentionDismissedRange(null)
      return
    }
    if (contextInjectionTrigger.range.start !== mentionDismissedRange.start) {
      setMentionDismissedRange(null)
    }
  }, [mentionDismissedRange, contextInjectionTrigger])

  useEffect(() => {
    if (!projectContextEnabled || !activeSessionId) return
    void loadProjectContextForSession(activeSessionId)
  }, [activeSessionId, loadProjectContextForSession, projectContextEnabled])

  useEffect(() => {
    if (!projectContextEnabled || !projectId) return
    void loadProjectContextForProject(projectId)
  }, [projectId, loadProjectContextForProject, projectContextEnabled])

  useEffect(() => {
    if (pendingCursorRef.current === null) return
    const next = pendingCursorRef.current
    pendingCursorRef.current = null
    const node = textareaRef.current
    if (!node) return
    node.focus()
    node.setSelectionRange(next, next)
    setCursor(next)
  }, [value])

  const handleRootInjectionSelect = useCallback(
    (item: ComposerInjectionRootItem) => {
      if (!rootInjectionTrigger) return
      const result = replaceComposerInjectionRange(
        value,
        rootInjectionTrigger.range,
        item.canonicalTrigger,
      )
      pendingCursorRef.current = result.cursor
      setValue(result.text)
    },
    [rootInjectionTrigger, value],
  )

  const handleRootInjectionDismiss = useCallback(() => {
    if (!rootInjectionTrigger) return
    setRootInjectionDismissedRange({ ...rootInjectionTrigger.range })
  }, [rootInjectionTrigger])

  const handleMentionSelect = useCallback(
    (item: ProjectContextItem) => {
      if (!contextInjectionTrigger) return
      const result = replaceComposerInjectionRange(
        value,
        contextInjectionTrigger.range,
        item.body,
      )
      pendingCursorRef.current = result.cursor
      setValue(result.text)
    },
    [contextInjectionTrigger, value],
  )

  const handleMentionDismiss = useCallback(() => {
    if (!contextInjectionTrigger) return
    setMentionDismissedRange({ ...contextInjectionTrigger.range })
  }, [contextInjectionTrigger])

  const appSettings = useAppSettingsStore((s) => s.settings)
  const piModelVisibilityKey =
    appSettings.piModelVisibility.additionalModelIds.join('\u0000')
  const storedDefaults = useMemo(
    () => ({
      providerId: appSettings.defaultProviderId,
      modelId: appSettings.defaultModelId,
      effortId: appSettings.defaultEffortId,
    }),
    [
      appSettings.defaultProviderId,
      appSettings.defaultModelId,
      appSettings.defaultEffortId,
    ],
  )
  // A stranded session has no catalog entry to resolve against, and resolving
  // anyway hands back whichever provider happens to be first -- the composer
  // reading "OpenAI" over a Claude row (MAR-2550).
  const selection =
    selectionLocks.mode === 'stranded' && activeSession
      ? describeUnavailableProviderSelection(activeSession)
      : resolveProviderSelection(
          providers,
          selectionLocks.canContinue
            ? (activeSession?.providerId ?? null)
            : providerId,
          selectionLocks.canContinue ? (activeSession?.model ?? null) : modelId,
          selectionLocks.canContinue
            ? (activeSession?.effort ?? null)
            : effortId || null,
          selectionLocks.canContinue ? undefined : storedDefaults,
        )
  const showCodexUsagePill = shouldShowCodexUsagePill(selection)
  // The one value the strip renders and the send obeys (MAR-2642). Resolved on
  // every render rather than mirrored into state, so a machine removed in
  // Settings cannot be shown as selected for even one frame.
  const executionBar = resolveExecutionBarView({
    endpoints: appSettings.executionHostEndpoints,
    liveSessionHostId: activeSession
      ? (activeSession.executionHost ?? LOCAL_EXECUTION_HOST_ID)
      : null,
    providerId: selection.providerId,
    providerLabel: selection.providerLabel,
    contextKind: context.kind,
    selectedHostId: selectedExecutionHostId,
  })
  /**
   * What the send records, derived beside the strip that shows it.
   *
   * A primitive on purpose. The send closes over this rather than over the
   * view, so it cannot come to depend on a field of the view that its
   * dependency list does not cover — the failure would be the send going to a
   * machine other than the one named above it, which is the whole of what this
   * era exists to prevent.
   */
  const executionHostForSend = executionHostForNewSession(executionBar)
  const armedOutgoingRelays = useMemo(
    () => countArmedOutgoingRelays(relays, activeSessionId),
    [relays, activeSessionId],
  )
  const serviceTier =
    selection.providerId === 'codex'
      ? codexFastMode
        ? 'fast'
        : 'default'
      : null
  const midRunPolicy = useMemo(
    () =>
      resolveMidRunInputPolicy({
        status: activeSession?.status ?? null,
        attention: activeSession?.attention ?? null,
        provider: activeSession ? (activeProvider ?? null) : selection.provider,
      }),
    [activeSession, activeProvider, selection.provider],
  )
  const availableDeliveryModesKey = midRunPolicy.availableModes.join('|')

  const draftKey = activeSessionId ?? `${contextKey}:${DRAFT_KEY_NEW}`
  const attachmentDraft = useAttachmentDraft(draftKey)
  const {
    attachments,
    rejections,
    ingestInFlight,
    isDragging,
    onPaste: handlePaste,
    openFileDialog: handleAttachmentAdd,
    removeOne: handleAttachmentRemove,
    clearDraft,
  } = attachmentDraft
  const {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  } = attachmentDraft.dragHandlers
  const skillCatalog = useSkillStore((s) => s.catalog)
  const loadSkillCatalog = useSkillStore((s) => s.loadCatalog)
  const loadGlobalSkillCatalog = useSkillStore((s) => s.loadGlobalCatalog)
  const skillCatalogLoading = useSkillStore((s) => s.isCatalogLoading)
  const skillCatalogError = useSkillStore((s) => s.catalogError)
  const promptCatalog = usePromptLibraryStore((s) => s.catalog)
  const loadPromptCatalog = usePromptLibraryStore((s) => s.loadCatalog)
  const loadGlobalPromptCatalog = usePromptLibraryStore(
    (s) => s.loadGlobalCatalog,
  )
  const loadPromptDetails = usePromptLibraryStore((s) => s.loadDetails)
  const promptCatalogLoading = usePromptLibraryStore((s) => s.isCatalogLoading)
  const promptCatalogError = usePromptLibraryStore((s) => s.catalogError)
  const promptDetailsByPromptId = usePromptLibraryStore(
    (s) => s.detailsByPromptId,
  )
  const promptDetailsErrorByPromptId = usePromptLibraryStore(
    (s) => s.detailsErrorByPromptId,
  )
  const loadingDetailsPromptId = usePromptLibraryStore(
    (s) => s.loadingDetailsPromptId,
  )

  const capability = resolveAttachmentCapabilityForModel(
    selection.provider?.attachments,
    selection.model,
  )
  const capabilityResult = useMemo(
    () => validateAttachmentsAgainstCapability(attachments, capability),
    [attachments, capability],
  )
  const skillOptions = useMemo(
    () =>
      filterComposerSkills({
        catalog: skillCatalog,
        providerId: selection.providerId,
        query: skillQuery,
      }),
    [skillCatalog, selection.providerId, skillQuery],
  )
  const skillInjectionItems = useMemo(
    () =>
      filterComposerSkills({
        catalog: skillCatalog,
        providerId: selection.providerId,
        query: skillInjectionTrigger?.query ?? '',
      }),
    [skillCatalog, selection.providerId, skillInjectionTrigger?.query],
  )
  const skillInjectionPickerOpen =
    skillInjectionTrigger !== null &&
    !!selection.provider &&
    !(
      skillInjectionDismissedRange !== null &&
      skillInjectionDismissedRange.start === skillInjectionTrigger.range.start
    )
  const promptInjectionItems = useMemo(
    () =>
      filterComposerPrompts({
        catalog: promptCatalog,
        query: promptInjectionTrigger?.query ?? '',
      }),
    [promptCatalog, promptInjectionTrigger?.query],
  )
  const promptInjectionPickerOpen =
    promptInjectionTrigger !== null &&
    !(
      promptInjectionDismissedRange !== null &&
      promptInjectionDismissedRange.start === promptInjectionTrigger.range.start
    )
  const promptInjectionError =
    promptCatalogError ??
    (loadingDetailsPromptId
      ? null
      : Object.values(promptDetailsErrorByPromptId).find(Boolean) || null)

  const loadSkillsForCurrentContext = useCallback(() => {
    if (context.kind === 'global') {
      void loadGlobalSkillCatalog()
      return
    }
    if (projectId) void loadSkillCatalog(projectId)
  }, [context.kind, loadGlobalSkillCatalog, loadSkillCatalog, projectId])

  const loadPromptsForCurrentContext = useCallback(() => {
    if (context.kind === 'global') {
      void loadGlobalPromptCatalog()
      return
    }
    if (projectId) void loadPromptCatalog(projectId)
  }, [context.kind, loadGlobalPromptCatalog, loadPromptCatalog, projectId])

  useEffect(() => {
    loadProviders()
  }, [loadProviders, piModelVisibilityKey])

  useEffect(() => {
    setSelectedSkills([])
    setSelectedContextIds([])
    setSkillQuery('')
    setSkillPickerOpen(false)
    setContextPickerOpen(false)
    setSkillInjectionDismissedRange(null)
    setPromptInjectionDismissedRange(null)
  }, [contextKey, activeSessionId])

  useEffect(() => {
    if (!skillInjectionPickerOpen) return
    loadSkillsForCurrentContext()
  }, [loadSkillsForCurrentContext, skillInjectionPickerOpen])

  useEffect(() => {
    if (!promptInjectionPickerOpen) return
    loadPromptsForCurrentContext()
  }, [loadPromptsForCurrentContext, promptInjectionPickerOpen])

  useEffect(() => {
    setSkillInjectionHighlightedIndex(0)
  }, [skillInjectionPickerOpen ? skillInjectionTrigger?.query : null])

  useEffect(() => {
    setPromptInjectionHighlightedIndex(0)
  }, [promptInjectionPickerOpen ? promptInjectionTrigger?.query : null])

  useEffect(() => {
    if (skillInjectionDismissedRange === null) return
    if (!skillInjectionTrigger) {
      setSkillInjectionDismissedRange(null)
      return
    }
    if (
      skillInjectionTrigger.range.start !== skillInjectionDismissedRange.start
    ) {
      setSkillInjectionDismissedRange(null)
    }
  }, [skillInjectionDismissedRange, skillInjectionTrigger])

  useEffect(() => {
    if (promptInjectionDismissedRange === null) return
    if (!promptInjectionTrigger) {
      setPromptInjectionDismissedRange(null)
      return
    }
    if (
      promptInjectionTrigger.range.start !== promptInjectionDismissedRange.start
    ) {
      setPromptInjectionDismissedRange(null)
    }
  }, [promptInjectionDismissedRange, promptInjectionTrigger])

  useEffect(() => {
    const availableIds = new Set(projectContextItems.map((item) => item.id))
    setSelectedContextIds((current) =>
      current.filter((id) => availableIds.has(id)),
    )
  }, [projectContextItems])

  useEffect(() => {
    if (!midRunPolicy.availableModes.includes(deliveryMode)) {
      setDeliveryMode(midRunPolicy.defaultMode)
    }
  }, [
    deliveryMode,
    midRunPolicy.defaultMode,
    midRunPolicy.availableModes,
    availableDeliveryModesKey,
  ])

  useEffect(() => {
    setSelectedSkills((current) =>
      filterSelectionsForProvider(current, selection.providerId),
    )
  }, [selection.providerId])

  /**
   * A Codex account cannot serve a Claude turn, so the picker only ever offers
   * the current provider's accounts (PA9).
   */
  const providerAccountsForSession = useMemo(
    () => providerAccountsForProvider(providerAccounts, providerId),
    [providerAccounts, providerId],
  )

  // Enrolled accounts, refreshed whenever the composer switches session so a
  // just-enrolled or just-disabled account shows up without a restart.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let accounts: ProviderAccount[]
      try {
        accounts = await providerAccountApi.list()
      } catch {
        // A composer that cannot list accounts still composes; it offers the
        // ambient default, which is exactly what it did before PA5.
        accounts = []
      }
      if (!cancelled) setProviderAccounts(accounts)
    })()
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  /**
   * Seeds the picker from PA4's durable record — the account that served the
   * session's most recent turn — rather than from anything the composer
   * remembers, which would drift after a restart and quietly show the wrong
   * identity.
   */
  useEffect(() => {
    let cancelled = false

    const seed = async () => {
      if (!activeSessionId) {
        if (!cancelled) {
          setSelectedProviderAccountId(
            resolveInitialProviderAccountSelection({
              accounts: providerAccountsForSession,
              hasActiveSession: false,
            }),
          )
        }
        return
      }

      let lastTurnAccountId: string | null
      try {
        const turns = await turnsApi.listForSession(activeSessionId)
        lastTurnAccountId = turns.at(-1)?.providerAccountId ?? null
      } catch {
        // Unreadable turns mean "no record", which resolves to the ambient
        // default — never a guess at which account was in use.
        lastTurnAccountId = null
      }

      if (cancelled) return
      setSelectedProviderAccountId(
        resolveInitialProviderAccountSelection({
          accounts: providerAccountsForSession,
          lastTurnAccountId,
          hasActiveSession: true,
        }),
      )
    }

    void seed()
    return () => {
      cancelled = true
    }
  }, [activeSessionId, providerAccountsForSession])

  /**
   * Accounts are host-scoped (ADR 0007, PA10). A remote session runs on the
   * remote host's own credential, so the selection is neither offered nor sent
   * — the backend refuses it too, and the two must not disagree.
   */
  const providerAccountSelectionBlockedReason =
    describeProviderAccountSelectionBlock(executionBar.hostId)
  const effectiveProviderAccountId = providerAccountSelectionBlockedReason
    ? null
    : selectedProviderAccountId

  const providerAccountSelectionLocked = isProviderAccountSelectionLocked(
    activeSession
      ? { status: activeSession.status, attention: activeSession.attention }
      : null,
  )

  useEffect(() => {
    if (activeSession) {
      setProviderId(activeSession.providerId)
      setModelId(activeSession.model ?? '')
      setEffortId(activeSession.effort ?? '')
      setCodexFastMode(activeSession.serviceTier === 'fast')
      setPermissionConfig(
        activeSession.permissionConfig ?? resolveSimplePermissionConfig('ask'),
      )
      return
    }

    if (!selection.providerId) {
      return
    }

    setProviderId((current) => current || selection.providerId)
    setModelId((current) => current || selection.modelId)
    setEffortId((current) => current || selection.effortId)
  }, [
    activeSession,
    selection.providerId,
    selection.modelId,
    selection.effortId,
  ])

  const loadCodexUsage = useCallback(
    async (forceRefresh = false) => {
      if (!showCodexUsagePill) return
      setCodexUsageLoading(true)
      try {
        setCodexUsageSnapshot(
          findProviderQuotaSnapshot(
            await providerQuotaApi.list(forceRefresh),
            'codex',
          ),
        )
      } catch {
        setCodexUsageSnapshot(null)
      } finally {
        setCodexUsageLoading(false)
      }
    },
    [showCodexUsagePill],
  )

  useEffect(() => {
    if (!showCodexUsagePill) {
      setCodexUsageSnapshot(null)
      setCodexUsageLoading(false)
      return undefined
    }

    void loadCodexUsage(false)
    const intervalId = window.setInterval(() => {
      void loadCodexUsage(false)
    }, 120_000)
    return () => window.clearInterval(intervalId)
  }, [loadCodexUsage, showCodexUsagePill])

  const isSessionDone =
    !activeSession ||
    activeSession.status === 'completed' ||
    activeSession.status === 'failed'
  // Nothing here can reach a stranded session's row, so the box that looks
  // like it can send does not (MAR-2550).
  const isComposerDisabled =
    midRunPolicy.disabled || selectionLocks.mode === 'stranded'

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!selection.providerId || !selection.modelId) return
    // Submit is a control like any other (MAR-2550): a stranded session cannot
    // be continued, and the fall-through below would start a brand new session
    // on whichever provider the catalog offered instead.
    if (selectionLocks.mode === 'stranded') return
    // Quotes are a message on their own: selecting three passages and hitting
    // send without typing anything is a complete thought (RA2).
    if (!trimmed && attachments.length === 0 && pendingAnnotations.length === 0)
      return
    if (!capabilityResult.ok) return

    // The one place annotations become text. Everything downstream — the
    // transcript, the provider, the turn record — sees an ordinary message,
    // which is what "honest wire" means: no side channel, nothing the model
    // was told that Marcin cannot read back afterwards.
    const text = compileAnnotationsIntoPrompt(
      pendingAnnotations,
      trimmed,
      latestAgentMessageId,
    )

    const attachmentIds = attachments.map((a) => a.id)
    const hasAttachments = attachmentIds.length > 0
    const skillSelections =
      selectedSkills.length > 0 ? selectedSkills : undefined
    const contextItemIds =
      projectContextEnabled && selectedContextIds.length > 0
        ? selectedContextIds
        : undefined

    if (activeSession && selectionLocks.canContinue) {
      const mode = deliveryMode === 'normal' ? undefined : deliveryMode
      // One call, not four. The branching here only ever existed to skip past
      // optional positional arguments (MAR-2227); named fields omit them.
      sendMessageToSession({
        sessionId: activeSession.id,
        text,
        attachmentIds: hasAttachments ? attachmentIds : undefined,
        skillSelections,
        deliveryMode: mode,
        providerAccountId: effectiveProviderAccountId,
        // Only ever sent as true. Omitted otherwise so an ordinary send stays
        // byte-for-byte what it was before the quiet send existed.
        muteRelays: relaysMuted || undefined,
      })
      markAnnotationsSent()
      setValue('')
      setSelectedSkills([])
      setRelaysMuted(false)
      clearDraft()
      return
    }

    const baseName = trimmed || attachments[0]?.filename || 'New session'
    const name =
      baseName.length > 40 ? baseName.substring(0, 40) + '...' : baseName
    if (context.kind === 'global') {
      void (async () => {
        const startMessage = prepareNewSessionMessage
          ? prepareNewSessionMessage(text)
          : text
        const session = await createAndStartGlobalSession({
          providerId: selection.providerId,
          model: selection.modelId,
          effort: selection.effort?.id ?? null,
          name,
          message: startMessage,
          attachmentIds: hasAttachments ? attachmentIds : undefined,
          skillSelections,
          permissionConfig,
          serviceTier,
          providerAccountId: effectiveProviderAccountId,
        })
        if (session) {
          await onGlobalSessionCreated?.(session)
        }
      })()
      markAnnotationsSent()
    } else {
      createAndStartSession({
        projectId: context.projectId,
        workspaceId: context.workspaceId,
        providerId: selection.providerId,
        model: selection.modelId,
        effort: selection.effort?.id ?? null,
        name,
        message: text,
        attachmentIds: hasAttachments ? attachmentIds : undefined,
        skillSelections,
        contextItemIds,
        permissionConfig,
        serviceTier,
        executionHost: executionHostForSend,
        providerAccountId: effectiveProviderAccountId,
      })
      markAnnotationsSent()
    }
    setValue('')
    setSelectedSkills([])
    setSelectedContextIds([])
    clearDraft()
  }, [
    value,
    selection.providerId,
    selection.modelId,
    selection.effort,
    attachments,
    selectedSkills,
    selectedContextIds,
    capabilityResult.ok,
    activeSession,
    selectionLocks.mode,
    selectionLocks.canContinue,
    deliveryMode,
    sendMessageToSession,
    createAndStartSession,
    createAndStartGlobalSession,
    clearDraft,
    draftKey,
    context,
    projectContextEnabled,
    onGlobalSessionCreated,
    prepareNewSessionMessage,
    permissionConfig,
    serviceTier,
    // The resolved machine, not the whole view: the view is rebuilt every
    // render and would defeat this memo, while this changes exactly when the
    // send would go somewhere else. It replaces a dependency on the old
    // boolean, which never covered *which* Endpoint -- removing the picked one
    // in Settings left this callback still sending its id.
    executionHostForSend,
    effectiveProviderAccountId,
    // Load-bearing. Without it the toggle and the send disagree whenever
    // `attachments` happens to be stable -- which is exactly when the composer
    // holds an attachment draft, because `attachments` is otherwise a fresh
    // `[]` literal every render that rebuilds this callback and hides the miss.
    // The failure runs in the one direction this feature exists to prevent: the
    // message dispatches unmuted while the button says quiet.
    relaysMuted,
    pendingAnnotations,
    latestAgentMessageId,
    markAnnotationsSent,
  ])

  const handleProviderChange = (nextProviderId: string) => {
    const nextSelection = resolveProviderSelection(
      providers,
      nextProviderId,
      null,
      null,
      activeSession ? undefined : storedDefaults,
    )
    setProviderId(nextSelection.providerId)
    setModelId(nextSelection.modelId)
    setEffortId(nextSelection.effortId)
    setCodexFastMode(false)
    setPermissionAdvancedOpen(false)
    if (permissionConfig.preset === 'custom') {
      setPermissionConfig(
        defaultCustomPermissionConfigForProvider(nextSelection.providerId),
      )
    }
  }

  const handlePermissionPresetChange = (preset: 'ask' | 'yolo') => {
    setPermissionAdvancedOpen(false)
    setPermissionConfig(resolveSimplePermissionConfig(preset))
  }

  const handlePermissionAdvancedOpenChange = (open: boolean) => {
    setPermissionAdvancedOpen(open)
    if (open && permissionConfig.preset !== 'custom') {
      setPermissionConfig(
        defaultCustomPermissionConfigForProvider(selection.providerId),
      )
    }
  }

  const handleSkillPickerOpenChange = useCallback(
    (nextOpen: boolean) => {
      setSkillPickerOpen(nextOpen)
      if (!nextOpen) return
      loadSkillsForCurrentContext()
    },
    [loadSkillsForCurrentContext],
  )

  const handleSkillToggle = useCallback((skill: SkillCatalogEntry) => {
    if (!skill.enabled) return

    setSelectedSkills((current) => {
      const existingSelection = current.some(
        (selection) => selection.id === skill.id,
      )

      if (existingSelection) {
        return current.filter((selection) => selection.id !== skill.id)
      }

      return [...current, skillSelectionFromCatalogEntry(skill)]
    })
  }, [])

  const handleSkillRemove = useCallback((skillId: string) => {
    setSelectedSkills((current) =>
      current.filter((selection) => selection.id !== skillId),
    )
  }, [])

  const handleSkillInjectionSelect = useCallback(
    (skill: SkillCatalogEntry) => {
      if (!skillInjectionTrigger || !skill.enabled) return

      setSelectedSkills((current) => {
        const existingSelection = current.some(
          (selection) => selection.id === skill.id,
        )
        if (existingSelection) return current
        return [...current, skillSelectionFromCatalogEntry(skill)]
      })

      const result = replaceComposerInjectionRange(
        value,
        skillInjectionTrigger.range,
        '',
      )
      pendingCursorRef.current = result.cursor
      setValue(result.text)
    },
    [skillInjectionTrigger, value],
  )

  const handleSkillInjectionDismiss = useCallback(() => {
    if (!skillInjectionTrigger) return
    setSkillInjectionDismissedRange({ ...skillInjectionTrigger.range })
  }, [skillInjectionTrigger])

  const handlePromptInjectionSelect = useCallback(
    async (prompt: PromptLibraryEntry) => {
      if (!promptInjectionTrigger || !promptCatalog) return

      const details =
        promptDetailsByPromptId[prompt.id] ??
        (await loadPromptDetails(promptCatalog.projectId, prompt))
      if (!details) return

      const result = replaceComposerInjectionRange(
        value,
        promptInjectionTrigger.range,
        details.promptText,
      )
      pendingCursorRef.current = result.cursor
      setValue(result.text)
    },
    [
      loadPromptDetails,
      promptCatalog,
      promptDetailsByPromptId,
      promptInjectionTrigger,
      value,
    ],
  )

  const handlePromptInjectionDismiss = useCallback(() => {
    if (!promptInjectionTrigger) return
    setPromptInjectionDismissedRange({ ...promptInjectionTrigger.range })
  }, [promptInjectionTrigger])

  const handleContextToggle = useCallback((id: string) => {
    setSelectedContextIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    )
  }, [])

  const handleContextRemove = useCallback((id: string) => {
    setSelectedContextIds((current) => current.filter((value) => value !== id))
  }, [])

  const handleModelChange = (nextModelId: string, nextProviderId?: string) => {
    if (activeSession && selectionLocks.canContinue) {
      // A live conversation's model lives on its row, not in this component
      // (MAR-2550). Persist and let the returned row redraw the pickers: if the
      // backend refuses -- the turn started between this render and this click
      // -- the composer must keep showing the model the next turn will actually
      // run on, and the store's error becomes a toast.
      //
      // A pick that resolves to another provider is refused here rather than
      // written with its provider quietly dropped, which is how a Codex model
      // id once landed on a Claude session's row.
      const write = resolveSessionModelSelectionWrite(
        providers,
        activeSession,
        nextProviderId ?? null,
        nextModelId,
      )
      if (!write) return
      void setSessionModelSelection(activeSession.id, write).catch(() => {})
      return
    }
    const nextSelection = resolveProviderSelection(
      providers,
      nextProviderId ?? selection.providerId,
      nextModelId,
      null,
      storedDefaults,
    )
    setProviderId(nextSelection.providerId)
    setModelId(nextSelection.modelId)
    setEffortId(nextSelection.effortId)
  }

  /**
   * Effort travels with the model: same mode, same lock, same write. It had no
   * provider dimension to get wrong, and so no guard either -- which is how it
   * kept writing to a stranded session's row after the model picker stopped.
   */
  const handleEffortChange = (nextEffortId: ReasoningEffort | '') => {
    if (activeSession && selectionLocks.canContinue) {
      void setSessionModelSelection(activeSession.id, {
        providerId: activeSession.providerId,
        model: activeSession.model,
        effort: nextEffortId || null,
      }).catch(() => {})
      return
    }
    setEffortId(nextEffortId)
  }

  const handleSkillsBrowse = useCallback(() => {
    setSkillPickerOpen(false)
    openDialog('skills-browser')
  }, [openDialog])

  const handleProviderUsageSettingsOpen = useCallback(() => {
    openDialog('app-settings', { appSettingsSection: 'usage' })
  }, [openDialog])

  return (
    <>
      <Composer
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        providers={providers}
        selection={selection}
        onProviderChange={handleProviderChange}
        onModelChange={handleModelChange}
        onEffortChange={handleEffortChange}
        providerAccounts={providerAccountsForSession}
        selectedProviderAccountId={selectedProviderAccountId}
        onProviderAccountChange={setSelectedProviderAccountId}
        providerAccountSelectionLocked={providerAccountSelectionLocked}
        providerAccountSelectionBlockedReason={
          providerAccountSelectionBlockedReason
        }
        codexFastMode={codexFastMode}
        onCodexFastModeChange={setCodexFastMode}
        armedOutgoingRelays={armedOutgoingRelays}
        relaysMuted={relaysMuted}
        onRelaysMutedChange={setRelaysMuted}
        executionBar={executionBar}
        onExecutionHostChange={setSelectedExecutionHostId}
        permissionConfig={permissionConfig}
        permissionAdvancedOpen={permissionAdvancedOpen}
        onPermissionPresetChange={handlePermissionPresetChange}
        onPermissionAdvancedOpenChange={handlePermissionAdvancedOpenChange}
        onCodexApprovalPolicyChange={(approvalPolicy) =>
          setPermissionConfig((current) =>
            withCodexApprovalPolicy(current, approvalPolicy),
          )
        }
        onCodexSandboxChange={(sandbox) =>
          setPermissionConfig((current) => withCodexSandbox(current, sandbox))
        }
        onClaudeCodePermissionModeChange={(permissionMode) =>
          setPermissionConfig((current) =>
            withClaudeCodePermissionMode(current, permissionMode),
          )
        }
        usagePill={
          showCodexUsagePill ? (
            <CodexUsagePillContainer
              snapshot={codexUsageSnapshot}
              isLoading={codexUsageLoading}
              onRefresh={() => void loadCodexUsage(true)}
              onOpenSettings={handleProviderUsageSettingsOpen}
            />
          ) : null
        }
        contextWindowDot={
          activeSession ? (
            <ContextWindowDot
              contextWindow={activeSession.contextWindow}
              session={activeSession}
              provider={activeProvider}
              hasPendingQueuedInput={queuedInputs.some(
                (item) =>
                  item.state === 'queued' || item.state === 'dispatching',
              )}
              onCompact={() => compactSessionContext(activeSession.id)}
            />
          ) : null
        }
        deliveryMode={deliveryMode}
        deliveryModes={midRunPolicy.availableModes}
        onDeliveryModeChange={setDeliveryMode}
        everyTurnContextCount={everyTurnContextCount}
        textareaRef={textareaRef}
        rootInjectionPickerOpen={rootInjectionPickerOpen}
        rootInjectionItems={rootInjectionItems}
        rootInjectionHighlightedIndex={rootInjectionHighlightedIndex}
        onRootInjectionSelect={handleRootInjectionSelect}
        onRootInjectionHover={setRootInjectionHighlightedIndex}
        onRootInjectionDismiss={handleRootInjectionDismiss}
        skillInjectionPickerOpen={skillInjectionPickerOpen}
        skillInjectionItems={skillInjectionItems}
        skillInjectionHighlightedIndex={skillInjectionHighlightedIndex}
        onSkillInjectionSelect={handleSkillInjectionSelect}
        onSkillInjectionHover={setSkillInjectionHighlightedIndex}
        onSkillInjectionDismiss={handleSkillInjectionDismiss}
        promptInjectionPickerOpen={promptInjectionPickerOpen}
        promptInjectionItems={promptInjectionItems}
        promptInjectionHighlightedIndex={promptInjectionHighlightedIndex}
        promptInjectionLoading={
          promptCatalogLoading || loadingDetailsPromptId !== null
        }
        promptInjectionError={promptInjectionError}
        onPromptInjectionSelect={handlePromptInjectionSelect}
        onPromptInjectionHover={setPromptInjectionHighlightedIndex}
        onPromptInjectionDismiss={handlePromptInjectionDismiss}
        mentionPickerOpen={mentionPickerOpen}
        mentionItems={mentionItems}
        mentionHighlightedIndex={mentionHighlightedIndex}
        onMentionSelect={handleMentionSelect}
        onMentionHover={setMentionHighlightedIndex}
        onMentionDismiss={handleMentionDismiss}
        onSelectionChange={setCursor}
        selectionDisabled={selectionLocks.providerLocked}
        modelSelectionDisabled={selectionLocks.modelLocked}
        sessionProviderId={activeSession?.providerId ?? null}
        placeholder={
          selectionLocks.mode === 'stranded'
            ? `${activeSession?.providerId ?? 'This session'} is unavailable, so this session cannot continue.`
            : activeSession?.attention === 'needs-input'
              ? 'Respond to the agent...'
              : activeSession?.status === 'running'
                ? midRunPolicy.disabled
                  ? 'Session is running...'
                  : deliveryMode === 'steer'
                    ? 'Steer current run...'
                    : 'Queue a follow-up...'
                : selectionLocks.canContinue
                  ? 'Send a follow-up...'
                  : isSessionDone
                    ? 'What would you like to work on?'
                    : 'Session is running...'
        }
        disabled={isComposerDisabled}
        attachments={attachments}
        hasPendingAnnotations={pendingAnnotations.length > 0}
        attachmentErrorByAttachmentId={capabilityResult.errorByAttachmentId}
        hasAttachmentErrors={!capabilityResult.ok}
        attachmentsIngestInFlight={ingestInFlight}
        isDragging={isDragging}
        skillPickerOpen={skillPickerOpen}
        skillQuery={skillQuery}
        skillOptions={skillOptions}
        selectedSkills={selectedSkills}
        contextPickerOpen={contextPickerOpen}
        projectContextEnabled={projectContextEnabled}
        projectContextItems={projectContextItems}
        selectedContextItems={selectedContextItems}
        skillCatalogLoading={skillCatalogLoading}
        skillCatalogError={skillCatalogError}
        onSkillPickerOpenChange={handleSkillPickerOpenChange}
        onSkillQueryChange={setSkillQuery}
        onSkillToggle={handleSkillToggle}
        onSkillRemove={handleSkillRemove}
        onContextPickerOpenChange={setContextPickerOpen}
        onContextToggle={handleContextToggle}
        onContextRemove={handleContextRemove}
        onSkillsBrowse={handleSkillsBrowse}
        onAttachmentAdd={handleAttachmentAdd}
        onAttachmentRemove={handleAttachmentRemove}
        onAttachmentOpen={setPreviewAttachment}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
      />
      {queuedInputs.length > 0 ? (
        <div
          className="mx-auto mt-2 w-full max-w-2xl rounded-md border border-border bg-muted/30 px-3 py-2"
          data-testid="queued-inputs"
        >
          <div className="space-y-2">
            {queuedInputs.map((input) => (
              <div
                key={input.id}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <span>
                      {DELIVERY_MODE_LABELS[input.deliveryMode] ??
                        input.deliveryMode}
                    </span>
                    <span>{QUEUED_INPUT_STATE_LABELS[input.state]}</span>
                  </div>
                  <div className="truncate text-foreground">
                    {getQueuedInputPreview(input)}
                  </div>
                  {input.error ? (
                    <div className="truncate text-destructive">
                      {input.error}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  aria-label="Cancel queued input"
                  disabled={input.state !== 'queued'}
                  onClick={() => void cancelQueuedInput(input.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {rejections.length > 0 && (
        <div
          role="status"
          className="mx-auto mt-2 w-full max-w-2xl rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
        >
          {rejections.map((r, i) => (
            <div key={`${r.filename}-${i}`}>
              <span className="font-medium">{r.filename}:</span> {r.reason}
            </div>
          ))}
        </div>
      )}
      <AttachmentPreviewContainer
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </>
  )
}
