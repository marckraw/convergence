import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  resolveProviderSelection,
  sessionApi,
  useSessionStore,
  type ForkStrategy,
  type ReasoningEffort,
  type ConversationItem,
  type SessionSummary,
  type WorkspaceMode,
} from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import { useTaskProgress } from '@/entities/task-progress'
import { SessionForkDialog } from './session-fork.presentational'
import {
  computeSeedSizeWarning,
  deriveForkProgressLabel,
  renderSeedMarkdown,
} from './session-fork.pure'
import {
  MIN_TRANSCRIPT_ENTRIES_FOR_SUMMARY,
  type PreviewState,
} from './session-fork.types'

const EMPTY_PREVIEW: PreviewState = { status: 'idle' }

export const SessionForkDialogContainer: FC = () => {
  const open = useDialogStore((s) => s.openDialog === 'session-fork')
  const payload = useDialogStore((s) => s.payload)
  const closeDialog = useDialogStore((s) => s.close)
  const providers = useSessionStore((s) => s.providers)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const globalSessions = useSessionStore((s) => s.globalSessions)
  const previewFork = useSessionStore((s) => s.previewFork)
  const forkFull = useSessionStore((s) => s.forkFull)
  const forkSummary = useSessionStore((s) => s.forkSummary)
  const appSettings = useAppSettingsStore((s) => s.settings)
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

  const parentSessionId = payload?.parentSessionId ?? null
  const [parent, setParent] = useState<SessionSummary | null>(null)
  const [parentConversation, setParentConversation] = useState<
    ConversationItem[]
  >([])
  const [name, setName] = useState('')
  const [strategy, setStrategy] = useState<ForkStrategy>('full')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [effortId, setEffortId] = useState<ReasoningEffort | ''>('')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('reuse')
  const [workspaceBranchName, setWorkspaceBranchName] = useState('')
  const [additionalInstruction, setAdditionalInstruction] = useState('')
  const [seedMarkdown, setSeedMarkdown] = useState('')
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW)
  const [previewRequestId, setPreviewRequestId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const progressView = useTaskProgress(previewRequestId)
  const progressLabel =
    preview.status === 'loading' && progressView
      ? deriveForkProgressLabel({
          elapsedMs: progressView.elapsedMs,
          msSinceLastEvent: progressView.msSinceLastEvent,
        })
      : null

  const selection = useMemo(
    () =>
      resolveProviderSelection(
        providers,
        providerId || null,
        modelId || null,
        effortId || null,
        storedDefaults,
      ),
    [providers, providerId, modelId, effortId, storedDefaults],
  )

  const transcriptLength = parentConversation.length
  const summaryAllowed = transcriptLength >= MIN_TRANSCRIPT_ENTRIES_FOR_SUMMARY
  const summaryDisabledReason = summaryAllowed
    ? null
    : 'Parent transcript too short to summarise.'

  const sizeWarning = useMemo(() => {
    if (!parent || strategy !== 'full') return null
    const parentContext = parent.contextWindow
    const windowTokens =
      parentContext?.availability === 'available'
        ? parentContext.windowTokens
        : null
    return computeSeedSizeWarning(parentConversation, windowTokens)
  }, [parent, parentConversation, strategy])

  useEffect(() => {
    if (open) loadProviders()
  }, [open, loadProviders])

  useEffect(() => {
    if (!open || !parentSessionId) {
      setParent(null)
      setParentConversation([])
      return
    }
    let cancelled = false
    const existing = globalSessions.find((s) => s.id === parentSessionId)
    if (existing) {
      setParent(existing)
    }
    setParentConversation([])
    if (!existing) {
      void sessionApi.getSummaryById(parentSessionId).then((session) => {
        if (!cancelled) setParent(session)
      })
    }
    void sessionApi.getConversation(parentSessionId).then((conversation) => {
      if (!cancelled) setParentConversation(conversation)
    })
    return () => {
      cancelled = true
    }
  }, [open, parentSessionId, globalSessions])

  useEffect(() => {
    if (!open || !parent) return
    setName(`${parent.name} (fork)`)
    setStrategy('full')
    setProviderId(parent.providerId)
    setModelId(parent.model ?? '')
    setEffortId((parent.effort as ReasoningEffort | null) ?? '')
    setWorkspaceMode('reuse')
    setWorkspaceBranchName('')
    setAdditionalInstruction('')
    setSeedMarkdown('')
    setPreview(EMPTY_PREVIEW)
    setPreviewRequestId(null)
    setSubmitError(null)
  }, [open, parent])

  const runPreview = useCallback(async () => {
    if (!parent) return
    const requestId = crypto.randomUUID()
    setPreviewRequestId(requestId)
    setPreview({ status: 'loading' })
    try {
      const summary = await previewFork(parent.id, requestId)
      const md = renderSeedMarkdown({
        summary,
        parentName: parent.name,
        additionalInstruction: additionalInstruction.trim() || null,
      })
      setPreview({ status: 'ready', summary })
      setSeedMarkdown(md)
    } catch (err) {
      setPreview({
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to extract summary',
      })
    }
  }, [parent, previewFork, additionalInstruction])

  useEffect(() => {
    if (open && strategy === 'summary' && parent && preview.status === 'idle') {
      void runPreview()
    }
  }, [open, strategy, parent, preview.status, runPreview])

  const handleStrategyChange = useCallback((next: ForkStrategy) => {
    setStrategy(next)
    if (next === 'full') {
      setPreview(EMPTY_PREVIEW)
      setSeedMarkdown('')
    } else {
      setPreview(EMPTY_PREVIEW)
    }
  }, [])

  const handleProviderChange = useCallback(
    (nextProviderId: string) => {
      const next = resolveProviderSelection(
        providers,
        nextProviderId,
        null,
        null,
        storedDefaults,
      )
      setProviderId(next.providerId)
      setModelId(next.modelId)
      setEffortId(next.effortId)
    },
    [providers, storedDefaults],
  )

  const handleModelChange = useCallback(
    (nextModelId: string) => {
      const next = resolveProviderSelection(
        providers,
        providerId || null,
        nextModelId,
        null,
        storedDefaults,
      )
      setModelId(next.modelId)
      setEffortId(next.effortId)
    },
    [providers, providerId, storedDefaults],
  )

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) closeDialog()
    },
    [closeDialog],
  )

  const handleCancel = useCallback(() => {
    closeDialog()
  }, [closeDialog])

  const handleConfirm = useCallback(async () => {
    if (!parent) return
    setIsSubmitting(true)
    setSubmitError(null)
    const common = {
      parentSessionId: parent.id,
      name: name.trim(),
      providerId: selection.providerId,
      modelId: selection.modelId,
      effort: selection.effort?.id ?? null,
      workspaceMode,
      workspaceBranchName:
        workspaceMode === 'fork' ? workspaceBranchName.trim() : null,
      additionalInstruction: additionalInstruction.trim() || null,
    }
    try {
      if (strategy === 'full') {
        await forkFull({ ...common, strategy: 'full' })
      } else {
        await forkSummary({
          ...common,
          strategy: 'summary',
          seedMarkdown,
        })
      }
      closeDialog()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to create fork',
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    parent,
    name,
    selection,
    workspaceMode,
    workspaceBranchName,
    additionalInstruction,
    strategy,
    forkFull,
    forkSummary,
    seedMarkdown,
    closeDialog,
  ])

  if (!open || !parent) return null

  return (
    <SessionForkDialog
      open={open}
      onOpenChange={handleOpenChange}
      parentName={parent.name}
      name={name}
      strategy={strategy}
      summaryAllowed={summaryAllowed}
      summaryDisabledReason={summaryDisabledReason}
      providers={providers}
      selection={selection}
      sizeWarning={sizeWarning}
      workspaceMode={workspaceMode}
      workspaceBranchName={workspaceBranchName}
      additionalInstruction={additionalInstruction}
      seedMarkdown={seedMarkdown}
      preview={preview}
      progressLabel={progressLabel}
      isSubmitting={isSubmitting}
      submitError={submitError}
      onNameChange={setName}
      onStrategyChange={handleStrategyChange}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onEffortChange={setEffortId}
      onWorkspaceModeChange={setWorkspaceMode}
      onWorkspaceBranchNameChange={setWorkspaceBranchName}
      onAdditionalInstructionChange={setAdditionalInstruction}
      onSeedMarkdownChange={setSeedMarkdown}
      onRetryPreview={() => void runPreview()}
      onConfirm={() => void handleConfirm()}
      onCancel={handleCancel}
    />
  )
}
