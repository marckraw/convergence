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
  catalogInForce,
  providerCatalogHostLabel,
  providerCatalogInForce,
  providerCatalogSourceForHost,
  repositoryOriginApi,
  resolveMidRunInputPolicy,
  resolveOptionRowCatalog,
  selectableProviderDescriptors,
  selectLatestAgentMessageId,
  type ProviderCatalogEntry,
} from '@/entities/session'
import {
  compileAnnotationsIntoPrompt,
  selectPendingAnnotations,
  useResponseAnnotationStore,
  useSessionAnnotations,
} from '@/entities/response-annotation'
import { useAppSettingsStore } from '@/entities/app-settings'
import {
  isLocalExecutionHost,
  LOCAL_EXECUTION_HOST_ID,
} from '@/entities/execution-host'
import { useProjectStore } from '@/entities/project'
import { useSessionRelayStore } from '@/entities/session-relay'
import { useDialogStore } from '@/entities/dialog'
import {
  isProviderAccountSelectionLocked,
  providerAccountsForHost,
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
  defaultPermissionPresetForHost,
  executionHostForNewSession,
  resolveExecutionBarView,
} from './execution-bar.pure'
import {
  resolveWorkAddressSlot,
  workAddressForNewSession,
  type LocalRepositoryState,
} from './work-address-slot.pure'
import { CodexUsagePillContainer } from './codex-usage-pill.container'
import { shouldShowCodexBillingControls } from './codex-usage-pill.pure'
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

/**
 * The catalog of a machine that has not answered. A module constant so the
 * `providers` memo below keeps one identity across renders while the row is
 * still a notice — a fresh `[]` there would rebuild the selection on every
 * keystroke.
 */
const NO_CATALOG_ENTRIES: readonly ProviderCatalogEntry[] = []
const EMPTY_PROJECT_CONTEXT_ITEMS: ProjectContextItem[] = []
/**
 * "Nobody has read this project's origin." One value, so a composer that never
 * asks re-renders no more than a composer that has not answered yet.
 */
const NOT_LOOKED_FOR_REPOSITORY: LocalRepositoryState = { status: 'asking' }

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
   * The place on that machine he last picked (MAR-2689).
   *
   * A choice id, held raw and clamped at the read by `resolveWorkAddressSlot`
   * exactly as the machine above it is: switching to a machine that does not
   * have his Project falls back to the default there, and switching back
   * restores it rather than having quietly forgotten it.
   */
  const [selectedWorkAddressId, setSelectedWorkAddressId] = useState<
    string | null
  >(null)
  /**
   * What a daemon could clone for this project, read from the main process by
   * the same derivation the start path uses (MAR-2689).
   *
   * `asking` until it answers, because "no repository" and "not looked yet"
   * lead to opposite renders and a bare null cannot tell them apart.
   */
  const [localRepository, setLocalRepository] = useState<LocalRepositoryState>(
    NOT_LOOKED_FOR_REPOSITORY,
  )
  /**
   * Whether he has touched the permission preset for this composer (MAR-2689).
   *
   * The remote default is a default, not an override: switching the strip to a
   * daemon flips an untouched preset to `yolo`, and never flips one he set. A
   * flag rather than comparing the config to the default, because "he chose
   * `ask` on a remote" and "nobody has chosen anything" are the same value and
   * opposite instructions.
   */
  const [permissionTouched, setPermissionTouched] = useState(false)
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
  const providerCatalogs = useSessionStore((s) => s.providerCatalogs)
  const remoteProjectCatalogs = useSessionStore((s) => s.remoteProjectCatalogs)
  const projects = useProjectStore((s) => s.projects)
  const openDialog = useDialogStore((s) => s.open)
  const loadProviderCatalog = useSessionStore((s) => s.loadProviderCatalog)
  const loadRemoteProjectCatalog = useSessionStore(
    (s) => s.loadRemoteProjectCatalog,
  )
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
  const appSettings = useAppSettingsStore((s) => s.settings)
  const piModelVisibilityKey =
    appSettings.piModelVisibility.additionalModelIds.join('\u0000')
  /**
   * The one value the strip renders and the send obeys (MAR-2642). Resolved on
   * every render rather than mirrored into state, so a machine removed in
   * Settings cannot be shown as selected for even one frame.
   *
   * Resolved before anything the row reads, because that is the direction of
   * this whole era: the machine is chosen, and the options obey it (MAR-2619).
   * Until S3 the arrow ran backwards -- the strip asked which provider was
   * selected so it could block machines that could not run it -- and a row
   * that now comes *from* the machine cannot also be an input to choosing one
   * without the two chasing each other. The order is load-bearing rather than
   * tidy: written the other way round these are const declarations reading
   * each other before they exist, which is a compile error, not a subtle bug.
   */
  const executionBar = resolveExecutionBarView({
    endpoints: appSettings.executionHostEndpoints,
    liveSessionHostId: activeSession
      ? (activeSession.executionHost ?? LOCAL_EXECUTION_HOST_ID)
      : null,
    contextKind: context.kind,
    selectedHostId: selectedExecutionHostId,
  })
  /**
   * Which machine's catalog this row is about, and everything the renderer can
   * check about it. Recomputed every render from the Endpoints as they stand,
   * so an Endpoint repointed in Settings stops matching the catalog read from
   * its old address on the very render that shows the change.
   */
  const catalogSource = useMemo(
    () =>
      providerCatalogSourceForHost(
        executionBar.hostId,
        appSettings.executionHostEndpoints,
      ),
    [executionBar.hostId, appSettings.executionHostEndpoints],
  )
  const hostLabel = providerCatalogHostLabel(
    catalogSource.executionHostId,
    appSettings.executionHostEndpoints,
  )
  const optionRow = resolveOptionRowCatalog({
    source: catalogSource,
    hostLabel,
    state: providerCatalogInForce(providerCatalogs, catalogSource),
  })
  /**
   * Where the session will work on the machine the strip names (MAR-2689).
   *
   * Resolved after the machine and from the same source value, so the two tiers
   * cannot name different machines: a Projects catalog is only true of the
   * daemon it was read from, and `catalogInForce` is what refuses one read from
   * an address this Endpoint has since been edited away from.
   */
  const workAddressSlot = resolveWorkAddressSlot({
    executionBar,
    hostLabel,
    projects: catalogInForce(remoteProjectCatalogs, catalogSource),
    localRepository,
    selectedId: selectedWorkAddressId,
    recordedAddress: activeSession?.workAddress,
  })
  const catalogEntries =
    optionRow.status === 'listed' ? optionRow.entries : NO_CATALOG_ENTRIES
  /**
   * What a session can actually be started on here. Blocked entries stay in
   * `optionRow` so the select can list them and say why the daemon will not
   * run them, and are kept out of this list so no selection can resolve onto
   * one (MAR-2682, "a blocked provider is listed and disabled, never
   * dropped").
   */
  const providers = useMemo(
    () => selectableProviderDescriptors(catalogEntries),
    [catalogEntries],
  )
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
  /**
   * The local Codex CLI's own billing: the quota pill and the Fast switch
   * (MAR-2682). Keyed on the machine as well as the provider — neither reaches
   * a daemon, and a control that cannot act on the machine the strip names does
   * not render.
   */
  const showCodexBillingControls = shouldShowCodexBillingControls({
    providerId: selection.providerId,
    executionHostId: executionBar.hostId,
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
  /**
   * The place the send records, derived from the very slot that states it.
   *
   * A value and not the view, for the reason its sibling above is: it changes
   * exactly when the send would go somewhere else, and the send closing over
   * the view would depend on fields its dependency list does not cover. The
   * strip states a place; this is that place, and there is no second derivation
   * between the two (MAR-2689).
   */
  const workAddressForSend = workAddressForNewSession(workAddressSlot)
  const armedOutgoingRelays = useMemo(
    () => countArmedOutgoingRelays(relays, activeSessionId),
    [relays, activeSessionId],
  )
  // Null on a daemon, and null is the honest value: the session record would
  // otherwise claim a service tier for a run this app never chose one for.
  const serviceTier = showCodexBillingControls
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

  /**
   * Asks the machine the strip names what it runs (MAR-2682).
   *
   * Keyed on the configuration and not just the id, so repointing an Endpoint
   * in Settings re-asks rather than keeping the answer the old address gave.
   * `piModelVisibilityKey` stays in the list for the same reason it was always
   * there: this machine's catalog is filtered by that setting, so changing it
   * changes the answer.
   */
  useEffect(() => {
    void loadProviderCatalog(catalogSource)
  }, [loadProviderCatalog, catalogSource, piModelVisibilityKey])

  /**
   * Asks the machine the strip names where it can work (MAR-2689).
   *
   * Keyed on the configuration for the same reason the provider catalog is:
   * repointing an Endpoint in Settings re-asks rather than keeping the answer
   * the old address gave. This machine is never asked — a local session works
   * in the directory the record already names, and an IPC round trip to be told
   * "no Projects" is a round trip that changes nothing on the one composer that
   * must stay byte-identical.
   */
  useEffect(() => {
    if (isLocalExecutionHost(catalogSource.executionHostId)) return
    void loadRemoteProjectCatalog(catalogSource)
  }, [loadRemoteProjectCatalog, catalogSource])

  /**
   * Whether this composer needs to know what a daemon could clone (MAR-2689).
   *
   * Exactly the condition under which the slot reads the answer — a composer
   * still choosing, on a machine that is not this one — derived from the same
   * view the slot resolves from, so the question and the need for it cannot
   * drift apart.
   *
   * Ruling 2 says the slot does not exist on Local, and the cost must not
   * exist either. Without this the effect ran on every composer with a project,
   * spawning git in the main process for a Local session that has no slot to
   * fill: the one composer that must stay byte-identical was paying for a tier
   * it never renders (MAR-2682).
   */
  const needsCloneableRepository =
    executionBar.mode === 'choosing' &&
    !isLocalExecutionHost(executionBar.hostId)

  /**
   * Reads what a daemon could clone for this project (MAR-2689).
   *
   * Asked of the project's repository rather than the session's working
   * directory: a worktree shares its parent's `origin`, so the answer is the
   * same, and this is the value that exists before a session does. A composer
   * with no project — a global chat — has no repository to offer, which is a
   * known answer and not a pending one.
   */
  useEffect(() => {
    // Back to "not looked yet" rather than leaving the last machine's answer
    // standing: switching from a daemon to Local and back must not show the
    // previous project's repository for the frame before the read lands.
    if (!needsCloneableRepository) {
      setLocalRepository(NOT_LOOKED_FOR_REPOSITORY)
      return
    }
    const repositoryPath = projects.find(
      (project) => project.id === projectId,
    )?.repositoryPath
    if (!repositoryPath) {
      setLocalRepository({ status: 'known', repository: null })
      return
    }
    let cancelled = false
    setLocalRepository({ status: 'asking' })
    void (async () => {
      try {
        const repository =
          await repositoryOriginApi.cloneableUrl(repositoryPath)
        if (!cancelled) setLocalRepository({ status: 'known', repository })
      } catch {
        // A read that failed is a repository nothing can be said about, and
        // `null` is exactly that claim: Repository mode is not offered and the
        // slot says so, rather than offering a place derived from nothing.
        //
        // Inside the async body rather than as a trailing `.catch`, because a
        // bridge method that is not there at all throws where it is *called* —
        // synchronously, out of the effect, taking the whole composer down
        // with it. A door this composer merely reads from must never be able
        // to do that.
        if (!cancelled) {
          setLocalRepository({ status: 'known', repository: null })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [needsCloneableRepository, projects, projectId])

  /**
   * The remote default: a session born on a daemon starts `yolo` (MAR-2689).
   *
   * Only while a session is being born, and only while he has not touched the
   * preset. A live session's preset comes from its record — the effect above
   * writes it — and his own choice outlives every machine switch after it.
   */
  useEffect(() => {
    if (activeSession) return
    if (permissionTouched) return
    setPermissionAdvancedOpen(false)
    setPermissionConfig(
      resolveSimplePermissionConfig(
        defaultPermissionPresetForHost(executionBar.hostId),
      ),
    )
  }, [activeSession, permissionTouched, executionBar.hostId])

  useEffect(() => {
    setSelectedSkills([])
    setSelectedContextIds([])
    setSkillQuery('')
    setSkillPickerOpen(false)
    setContextPickerOpen(false)
    setSkillInjectionDismissedRange(null)
    setPromptInjectionDismissedRange(null)
    // A different composer is a fresh set of choices: the place he picked on
    // the last one names a Project that may not exist for this one, and the
    // preset he touched there was a decision about that session (MAR-2689).
    setSelectedWorkAddressId(null)
    setPermissionTouched(false)
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
    () =>
      providerAccountsForHost(
        providerAccounts,
        executionBar.hostId,
        providerId,
      ),
    [providerAccounts, executionBar.hostId, providerId],
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
   * Accounts are host-scoped (ADR 0007, PA10; MAR-2682). A remote session runs
   * on the daemon's own credential, so there is no account to offer and none to
   * send. Both halves read the one host-scoped list above rather than a second
   * predicate: the picker renders nothing when handed nothing, so it disappears
   * because there are no accounts here and not because something remembered to
   * hide it.
   */
  const effectiveProviderAccountId =
    providerAccountsForSession.length === 0 ? null : selectedProviderAccountId

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
      if (!showCodexBillingControls) return
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
    [showCodexBillingControls],
  )

  useEffect(() => {
    if (!showCodexBillingControls) {
      setCodexUsageSnapshot(null)
      setCodexUsageLoading(false)
      return undefined
    }

    void loadCodexUsage(false)
    const intervalId = window.setInterval(() => {
      void loadCodexUsage(false)
    }, 120_000)
    return () => window.clearInterval(intervalId)
  }, [loadCodexUsage, showCodexBillingControls])

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
        workAddress: workAddressForSend,
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
    // The resolved place, not the slot: it changes exactly when the send would
    // work somewhere else (MAR-2689).
    workAddressForSend,
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

  /**
   * Every way he can change the preset goes through here first (MAR-2689).
   *
   * One place that records the touch, because the remote default must stop
   * applying the moment he decides for himself — and a touch recorded at only
   * some of the four controls is a default that reappears from whichever one
   * was forgotten.
   */
  const rememberPermissionTouch = useCallback(() => {
    setPermissionTouched(true)
  }, [])

  const handlePermissionPresetChange = (preset: 'ask' | 'yolo') => {
    rememberPermissionTouch()
    setPermissionAdvancedOpen(false)
    setPermissionConfig(resolveSimplePermissionConfig(preset))
  }

  const handlePermissionAdvancedOpenChange = (open: boolean) => {
    setPermissionAdvancedOpen(open)
    if (open && permissionConfig.preset !== 'custom') {
      rememberPermissionTouch()
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
        optionRow={optionRow}
        selection={selection}
        onProviderChange={handleProviderChange}
        onModelChange={handleModelChange}
        onEffortChange={handleEffortChange}
        providerAccounts={providerAccountsForSession}
        selectedProviderAccountId={selectedProviderAccountId}
        onProviderAccountChange={setSelectedProviderAccountId}
        providerAccountSelectionLocked={providerAccountSelectionLocked}
        codexFastMode={codexFastMode}
        onCodexFastModeChange={setCodexFastMode}
        codexBillingControlsAvailable={showCodexBillingControls}
        armedOutgoingRelays={armedOutgoingRelays}
        relaysMuted={relaysMuted}
        onRelaysMutedChange={setRelaysMuted}
        executionBar={executionBar}
        onExecutionHostChange={setSelectedExecutionHostId}
        workAddress={workAddressSlot}
        onWorkAddressChange={setSelectedWorkAddressId}
        permissionConfig={permissionConfig}
        permissionAdvancedOpen={permissionAdvancedOpen}
        onPermissionPresetChange={handlePermissionPresetChange}
        onPermissionAdvancedOpenChange={handlePermissionAdvancedOpenChange}
        onCodexApprovalPolicyChange={(approvalPolicy) => {
          rememberPermissionTouch()
          setPermissionConfig((current) =>
            withCodexApprovalPolicy(current, approvalPolicy),
          )
        }}
        onCodexSandboxChange={(sandbox) => {
          rememberPermissionTouch()
          setPermissionConfig((current) => withCodexSandbox(current, sandbox))
        }}
        onClaudeCodePermissionModeChange={(permissionMode) => {
          rememberPermissionTouch()
          setPermissionConfig((current) =>
            withClaudeCodePermissionMode(current, permissionMode),
          )
        }}
        usagePill={
          showCodexBillingControls ? (
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
