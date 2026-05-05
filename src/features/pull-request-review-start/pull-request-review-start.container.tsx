import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useDialogStore } from '@/entities/dialog'
import { useProjectStore } from '@/entities/project'
import {
  pullRequestReviewApi,
  usePullRequestStore,
  type PullRequestReviewPreview,
} from '@/entities/pull-request'
import {
  resolveProviderSelection,
  useSessionStore,
  type ReasoningEffort,
} from '@/entities/session'
import { useWorkspaceStore } from '@/entities/workspace'
import { PullRequestReviewStartDialog } from './pull-request-review-start.presentational'

export const PullRequestReviewStartDialogContainer: FC = () => {
  const open = useDialogStore(
    (s) => s.openDialog === 'pull-request-review-start',
  )
  const closeDialog = useDialogStore((s) => s.close)
  const activeProject = useProjectStore((s) => s.activeProject)
  const projects = useProjectStore((s) => s.projects)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const providers = useSessionStore((s) => s.providers)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const loadSessions = useSessionStore((s) => s.loadSessions)
  const loadGlobalSessions = useSessionStore((s) => s.loadGlobalSessions)
  const loadActiveConversation = useSessionStore(
    (s) => s.loadActiveConversation,
  )
  const recordRecentSession = useSessionStore((s) => s.recordRecentSession)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)
  const loadGlobalWorkspaces = useWorkspaceStore((s) => s.loadGlobalWorkspaces)
  const loadCurrentBranch = useWorkspaceStore((s) => s.loadCurrentBranch)
  const loadPullRequestsByProjectId = usePullRequestStore(
    (s) => s.loadByProjectId,
  )
  const appSettings = useAppSettingsStore((s) => s.settings)

  const [reference, setReference] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [effortId, setEffortId] = useState<ReasoningEffort | ''>('')
  const [preview, setPreview] = useState<PullRequestReviewPreview | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    if (open) void loadProviders()
  }, [open, loadProviders])

  useEffect(() => {
    if (!open) return
    setReference('')
    setSessionName('')
    setProviderId('')
    setModelId('')
    setEffortId('')
    setPreview(null)
    setError(null)
    setIsPreviewing(false)
    setIsSubmitting(false)
  }, [open])

  useEffect(() => {
    if (!selection.providerId) return
    setProviderId((current) => current || selection.providerId)
    setModelId((current) => current || selection.modelId)
    setEffortId((current) => current || selection.effortId)
  }, [selection.providerId, selection.modelId, selection.effortId])

  const handleReferenceChange = useCallback((value: string) => {
    setReference(value)
    setPreview(null)
    setError(null)
  }, [])

  const handlePreview = useCallback(async () => {
    const trimmed = reference.trim()
    if (!trimmed) return

    setIsPreviewing(true)
    setError(null)
    try {
      const result = await pullRequestReviewApi.previewReview({
        projectId: activeProject?.id ?? null,
        reference: trimmed,
      })
      setPreview(result)
      setSessionName((current) =>
        current.trim()
          ? current
          : `Review PR #${result.number}: ${result.title ?? 'Untitled PR'}`,
      )
    } catch (err) {
      setPreview(null)
      setError(
        err instanceof Error ? err.message : 'Failed to preview pull request',
      )
    } finally {
      setIsPreviewing(false)
    }
  }, [activeProject?.id, reference])

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
        selection.providerId,
        nextModelId,
        null,
        storedDefaults,
      )
      setModelId(next.modelId)
      setEffortId(next.effortId)
    },
    [providers, selection.providerId, storedDefaults],
  )

  const handleSubmit = useCallback(async () => {
    if (!preview) return
    if (!selection.providerId || !selection.modelId) return

    setIsSubmitting(true)
    setError(null)
    try {
      const result = await pullRequestReviewApi.prepareReviewSession({
        projectId: preview.projectId,
        reference: reference.trim(),
        providerId: selection.providerId,
        model: selection.modelId,
        effort: selection.effort?.id ?? null,
        sessionName: sessionName.trim() || undefined,
      })
      const targetProjectId = result.session.projectId
      const targetProject =
        projects.find((project) => project.id === targetProjectId) ?? null

      if (activeProject?.id !== targetProjectId) {
        await setActiveProject(targetProjectId)
      }

      await Promise.all([
        loadProjects(),
        loadWorkspaces(targetProjectId),
        loadGlobalWorkspaces(),
        targetProject
          ? loadCurrentBranch(targetProject.repositoryPath)
          : Promise.resolve(),
        loadSessions(targetProjectId),
        loadGlobalSessions(),
        loadPullRequestsByProjectId(targetProjectId),
      ])
      setActiveSession(result.session.id)
      recordRecentSession(result.session.id)
      void loadActiveConversation(result.session.id)
      closeDialog()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to start pull request review',
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    activeProject,
    closeDialog,
    loadActiveConversation,
    loadCurrentBranch,
    loadGlobalSessions,
    loadGlobalWorkspaces,
    loadProjects,
    loadPullRequestsByProjectId,
    loadSessions,
    loadWorkspaces,
    preview,
    projects,
    recordRecentSession,
    reference,
    selection.effort?.id,
    selection.modelId,
    selection.providerId,
    sessionName,
    setActiveProject,
    setActiveSession,
  ])

  return (
    <PullRequestReviewStartDialog
      open={open}
      projectName={preview?.projectName ?? activeProject?.name ?? null}
      reference={reference}
      sessionName={sessionName}
      providers={providers}
      selection={selection}
      preview={preview}
      isPreviewing={isPreviewing}
      isSubmitting={isSubmitting}
      error={error}
      onOpenChange={(next) => {
        if (!next) closeDialog()
      }}
      onReferenceChange={handleReferenceChange}
      onSessionNameChange={setSessionName}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onEffortChange={setEffortId}
      onPreview={() => void handlePreview()}
      onSubmit={() => void handleSubmit()}
    />
  )
}
