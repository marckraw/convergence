import { useState, useEffect, useMemo } from 'react'
import type { FC } from 'react'
import {
  resolveProviderSelection,
  useSessionStore,
  type ReasoningEffort,
} from '@/entities/session'
import { useAppSettingsStore } from '@/entities/app-settings'
import {
  useProjectContextStore,
  type ProjectContextItem,
} from '@/entities/project-context'
import { SessionStartForm } from './session-start.presentational'

const EMPTY_CONTEXT_ITEMS: ProjectContextItem[] = []

interface SessionStartProps {
  projectId: string
  workspaceId: string | null
}

export const SessionStart: FC<SessionStartProps> = ({
  projectId,
  workspaceId,
}) => {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [effortId, setEffortId] = useState<ReasoningEffort | ''>('')
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([])
  const providers = useSessionStore((s) => s.providers)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const createAndStartSession = useSessionStore((s) => s.createAndStartSession)
  const appSettings = useAppSettingsStore((s) => s.settings)
  const itemsByProjectId = useProjectContextStore((s) => s.itemsByProjectId)
  const loadProjectContext = useProjectContextStore((s) => s.loadForProject)
  const contextItems = itemsByProjectId[projectId] ?? EMPTY_CONTEXT_ITEMS
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
    providerId,
    modelId,
    effortId || null,
    storedDefaults,
  )

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  useEffect(() => {
    void loadProjectContext(projectId)
  }, [projectId, loadProjectContext])

  useEffect(() => {
    if (!selection.providerId) {
      return
    }

    setProviderId((current) => current || selection.providerId)
    setModelId((current) => current || selection.modelId)
    setEffortId((current) => current || selection.effortId)
  }, [selection.providerId, selection.modelId, selection.effortId])

  const handleSubmit = () => {
    if (
      !name.trim() ||
      !message.trim() ||
      !selection.providerId ||
      !selection.modelId
    ) {
      return
    }
    createAndStartSession(
      projectId,
      workspaceId,
      selection.providerId,
      selection.modelId,
      selection.effort?.id ?? null,
      name.trim(),
      message.trim(),
      undefined,
      undefined,
      selectedContextIds.length > 0 ? selectedContextIds : undefined,
    )
    setName('')
    setMessage('')
    setSelectedContextIds([])
  }

  const handleToggleContextItem = (id: string) => {
    setSelectedContextIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    )
  }

  const handleProviderChange = (nextProviderId: string) => {
    const nextSelection = resolveProviderSelection(
      providers,
      nextProviderId,
      null,
      null,
      storedDefaults,
    )
    setProviderId(nextSelection.providerId)
    setModelId(nextSelection.modelId)
    setEffortId(nextSelection.effortId)
  }

  const handleModelChange = (nextModelId: string) => {
    const nextSelection = resolveProviderSelection(
      providers,
      selection.providerId,
      nextModelId,
      null,
      storedDefaults,
    )
    setModelId(nextSelection.modelId)
    setEffortId(nextSelection.effortId)
  }

  return (
    <SessionStartForm
      name={name}
      message={message}
      providers={providers}
      selection={selection}
      contextItems={contextItems}
      selectedContextIds={selectedContextIds}
      onNameChange={setName}
      onMessageChange={setMessage}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onEffortChange={setEffortId}
      onToggleContextItem={handleToggleContextItem}
      onSubmit={handleSubmit}
    />
  )
}
