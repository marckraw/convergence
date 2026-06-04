import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FC, ClipboardEvent, DragEvent } from 'react'
import {
  type MidRunInputMode,
  resolveProviderSelection,
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
import { useAppSettingsStore } from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import {
  providerQuotaApi,
  type ProviderQuotaSnapshot,
} from '@/entities/provider-quota'
import {
  attachmentApi,
  useAttachmentStore,
  AttachmentPreviewContainer,
  type Attachment,
  type AttachmentIngestFileInput,
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
  resolveAttachmentCapabilityForModel,
  validateAttachmentsAgainstCapability,
} from './attachment-capability.pure'
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
import { filterComposerPrompts } from './composer-prompt-injection.pure'
import { resolveMidRunInputPolicy } from './mid-run-input.pure'
import { CodexUsagePillContainer } from './codex-usage-pill.container'
import { shouldShowCodexUsagePill } from './codex-usage-pill.pure'
import { CursorUsagePillContainer } from './cursor-usage-pill.container'
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

function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer | null,
): File[] {
  if (!dataTransfer) return []
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    return Array.from(dataTransfer.files)
  }
  const items = dataTransfer.items
  if (!items) return []
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

async function filesToIngestInputs(
  files: File[],
): Promise<AttachmentIngestFileInput[]> {
  const inputs: AttachmentIngestFileInput[] = []
  for (const file of files) {
    const buffer = await file.arrayBuffer()
    inputs.push({
      name: file.name || 'pasted-file',
      bytes: new Uint8Array(buffer),
      mimeType: file.type || undefined,
    })
  }
  return inputs
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
  const [isDragging, setIsDragging] = useState(false)
  const [codexUsageSnapshot, setCodexUsageSnapshot] =
    useState<ProviderQuotaSnapshot | null>(null)
  const [codexUsageLoading, setCodexUsageLoading] = useState(false)
  const [cursorUsageSnapshot, setCursorUsageSnapshot] =
    useState<ProviderQuotaSnapshot | null>(null)
  const [cursorUsageLoading, setCursorUsageLoading] = useState(false)
  const dragDepth = useRef(0)
  const providers = useSessionStore((s) => s.providers)
  const openDialog = useDialogStore((s) => s.open)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const createAndStartSession = useSessionStore((s) => s.createAndStartSession)
  const createAndStartGlobalSession = useSessionStore(
    (s) => s.createAndStartGlobalSession,
  )
  const sendMessageToSession = useSessionStore((s) => s.sendMessageToSession)
  const cancelQueuedInput = useSessionStore((s) => s.cancelQueuedInput)
  const sessions = useSessionStore((s) => s.sessions)
  const globalChatSessions = useSessionStore((s) => s.globalChatSessions)
  const queuedInputs = useSessionStore((s) =>
    activeSessionId
      ? (s.queuedInputsBySessionId[activeSessionId] ?? EMPTY_QUEUED_INPUTS)
      : EMPTY_QUEUED_INPUTS,
  )
  const sessionList = context.kind === 'project' ? sessions : globalChatSessions
  const activeSession = sessionList.find((s) => s.id === activeSessionId)
  const activeProvider = providers.find(
    (p) => p.id === activeSession?.providerId,
  )
  const canContinueActiveSession =
    !!activeSession && !!activeProvider?.supportsContinuation
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
  const selection = resolveProviderSelection(
    providers,
    activeSession?.providerId ?? providerId,
    activeSession?.model ?? modelId,
    activeSession?.effort ?? (effortId || null),
    activeSession ? undefined : storedDefaults,
  )
  const showCodexUsagePill = shouldShowCodexUsagePill(selection)
  const showCursorUsagePill = selection.providerId === 'cursor'
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
  const draft = useAttachmentStore((s) => s.drafts[draftKey])
  const ingestFiles = useAttachmentStore((s) => s.ingestFiles)
  const ingestFromPaths = useAttachmentStore((s) => s.ingestFromPaths)
  const removeDraft = useAttachmentStore((s) => s.removeDraft)
  const clearDraft = useAttachmentStore((s) => s.clearDraft)
  const clearRejections = useAttachmentStore((s) => s.clearRejections)
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

  const attachments = draft?.items ?? []
  const rejections = draft?.rejections ?? []
  const ingestInFlight = draft?.ingestInFlight ?? false

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

  useEffect(() => {
    if (activeSession) {
      setProviderId(activeSession.providerId)
      setModelId(activeSession.model ?? '')
      setEffortId(activeSession.effort ?? '')
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
        setCodexUsageSnapshot(await providerQuotaApi.getCodex(forceRefresh))
      } catch (err) {
        setCodexUsageSnapshot({
          providerId: 'codex',
          status: 'unavailable',
          source: 'provider-api',
          reason:
            err instanceof Error ? err.message : 'Codex usage is unavailable.',
          lastCheckedAt: new Date().toISOString(),
          stale: false,
        })
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

  const loadCursorUsage = useCallback(
    async (forceRefresh = false) => {
      if (!showCursorUsagePill) return
      setCursorUsageLoading(true)
      try {
        setCursorUsageSnapshot(await providerQuotaApi.getCursor(forceRefresh))
      } catch (err) {
        setCursorUsageSnapshot({
          providerId: 'cursor',
          status: 'unavailable',
          source: 'provider-api',
          reason:
            err instanceof Error ? err.message : 'Cursor usage is unavailable.',
          usageUrl: 'https://cursor.com/dashboard',
          lastCheckedAt: new Date().toISOString(),
          stale: false,
        })
      } finally {
        setCursorUsageLoading(false)
      }
    },
    [showCursorUsagePill],
  )

  useEffect(() => {
    if (!showCursorUsagePill) {
      setCursorUsageSnapshot(null)
      setCursorUsageLoading(false)
      return undefined
    }

    void loadCursorUsage(false)
    const intervalId = window.setInterval(() => {
      void loadCursorUsage(false)
    }, 120_000)
    return () => window.clearInterval(intervalId)
  }, [loadCursorUsage, showCursorUsagePill])

  useEffect(() => {
    if (rejections.length > 0) {
      const handle = window.setTimeout(() => {
        clearRejections(draftKey)
      }, 6000)
      return () => window.clearTimeout(handle)
    }
    return undefined
  }, [rejections, draftKey, clearRejections])

  const isSessionDone =
    !activeSession ||
    activeSession.status === 'completed' ||
    activeSession.status === 'failed'
  const isComposerDisabled = midRunPolicy.disabled

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!selection.providerId || !selection.modelId) return
    if (!trimmed && attachments.length === 0) return
    if (!capabilityResult.ok) return

    const attachmentIds = attachments.map((a) => a.id)
    const hasAttachments = attachmentIds.length > 0
    const skillSelections =
      selectedSkills.length > 0 ? selectedSkills : undefined
    const contextItemIds =
      projectContextEnabled && selectedContextIds.length > 0
        ? selectedContextIds
        : undefined

    if (activeSession && canContinueActiveSession) {
      const mode = deliveryMode === 'normal' ? undefined : deliveryMode
      if (hasAttachments || skillSelections) {
        if (mode) {
          sendMessageToSession(
            activeSession.id,
            trimmed,
            hasAttachments ? attachmentIds : undefined,
            skillSelections,
            mode,
          )
        } else {
          sendMessageToSession(
            activeSession.id,
            trimmed,
            hasAttachments ? attachmentIds : undefined,
            skillSelections,
          )
        }
      } else if (mode) {
        sendMessageToSession(
          activeSession.id,
          trimmed,
          undefined,
          undefined,
          mode,
        )
      } else {
        sendMessageToSession(activeSession.id, trimmed)
      }
      setValue('')
      setSelectedSkills([])
      clearDraft(draftKey)
      return
    }

    const baseName = trimmed || attachments[0]?.filename || 'New session'
    const name =
      baseName.length > 40 ? baseName.substring(0, 40) + '...' : baseName
    if (context.kind === 'global') {
      void (async () => {
        const startMessage = prepareNewSessionMessage
          ? prepareNewSessionMessage(trimmed)
          : trimmed
        const session = await createAndStartGlobalSession(
          selection.providerId,
          selection.modelId,
          selection.effort?.id ?? null,
          name,
          startMessage,
          hasAttachments ? attachmentIds : undefined,
          skillSelections,
          permissionConfig,
        )
        if (session) {
          await onGlobalSessionCreated?.(session)
        }
      })()
    } else if (hasAttachments || skillSelections) {
      createAndStartSession(
        context.projectId,
        context.workspaceId,
        selection.providerId,
        selection.modelId,
        selection.effort?.id ?? null,
        name,
        trimmed,
        hasAttachments ? attachmentIds : undefined,
        skillSelections,
        contextItemIds,
        permissionConfig,
      )
    } else {
      createAndStartSession(
        context.projectId,
        context.workspaceId,
        selection.providerId,
        selection.modelId,
        selection.effort?.id ?? null,
        name,
        trimmed,
        undefined,
        undefined,
        contextItemIds,
        permissionConfig,
      )
    }
    setValue('')
    setSelectedSkills([])
    setSelectedContextIds([])
    clearDraft(draftKey)
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
    canContinueActiveSession,
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
    const nextSelection = resolveProviderSelection(
      providers,
      nextProviderId ?? selection.providerId,
      nextModelId,
      null,
      activeSession ? undefined : storedDefaults,
    )
    setProviderId(nextSelection.providerId)
    setModelId(nextSelection.modelId)
    setEffortId(nextSelection.effortId)
  }

  const handleAttachmentAdd = useCallback(async () => {
    const paths = await attachmentApi.showOpenDialog()
    if (!paths || paths.length === 0) return
    await ingestFromPaths(draftKey, paths)
  }, [draftKey, ingestFromPaths])

  const ingestFilesFromFileList = useCallback(
    async (files: File[]) => {
      const inputs = await filesToIngestInputs(files)
      if (inputs.length === 0) return
      await ingestFiles(draftKey, inputs)
    },
    [draftKey, ingestFiles],
  )

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = collectFilesFromDataTransfer(e.clipboardData)
      if (files.length === 0) return
      e.preventDefault()
      void ingestFilesFromFileList(files)
    },
    [ingestFilesFromFileList],
  )

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current += 1
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepth.current = 0
      setIsDragging(false)
      const files = collectFilesFromDataTransfer(e.dataTransfer)
      if (files.length > 0) void ingestFilesFromFileList(files)
    },
    [ingestFilesFromFileList],
  )

  const handleAttachmentRemove = useCallback(
    (attachmentId: string) => {
      void removeDraft(draftKey, attachmentId)
    },
    [draftKey, removeDraft],
  )

  const handleSkillsBrowse = useCallback(() => {
    setSkillPickerOpen(false)
    openDialog('skills-browser')
  }, [openDialog])

  const handleCodexUsageSettingsOpen = useCallback(() => {
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
        onEffortChange={setEffortId}
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
        codexUsagePill={
          showCodexUsagePill ? (
            <CodexUsagePillContainer
              snapshot={codexUsageSnapshot}
              isLoading={codexUsageLoading}
              onRefresh={() => void loadCodexUsage(true)}
              onOpenSettings={handleCodexUsageSettingsOpen}
            />
          ) : showCursorUsagePill ? (
            <CursorUsagePillContainer
              snapshot={cursorUsageSnapshot}
              isLoading={cursorUsageLoading}
              onRefresh={() => void loadCursorUsage(true)}
              onOpenSettings={handleCodexUsageSettingsOpen}
            />
          ) : null
        }
        contextWindowDot={
          activeSession ? (
            <ContextWindowDot contextWindow={activeSession.contextWindow} />
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
        selectionDisabled={canContinueActiveSession}
        placeholder={
          activeSession?.attention === 'needs-input'
            ? 'Respond to the agent...'
            : activeSession?.status === 'running'
              ? midRunPolicy.disabled
                ? 'Session is running...'
                : deliveryMode === 'steer'
                  ? 'Steer current run...'
                  : 'Queue a follow-up...'
              : canContinueActiveSession
                ? 'Send a follow-up...'
                : isSessionDone
                  ? 'What would you like to work on?'
                  : 'Session is running...'
        }
        disabled={isComposerDisabled}
        attachments={attachments}
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
