import { useState, useEffect } from 'react'
import type { FC } from 'react'
import {
  resolveProviderSelection,
  useSessionStore,
  type ReasoningEffort,
} from '@/entities/session'
import { SessionStartForm } from './session-start.presentational'

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
  const providers = useSessionStore((s) => s.providers)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const createAndStartSession = useSessionStore((s) => s.createAndStartSession)
  const selection = resolveProviderSelection(
    providers,
    providerId,
    modelId,
    effortId || null,
  )

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

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
    )
    setName('')
    setMessage('')
  }

  const handleProviderChange = (nextProviderId: string) => {
    const nextSelection = resolveProviderSelection(
      providers,
      nextProviderId,
      null,
      null,
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
      onNameChange={setName}
      onMessageChange={setMessage}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onEffortChange={setEffortId}
      onSubmit={handleSubmit}
    />
  )
}
