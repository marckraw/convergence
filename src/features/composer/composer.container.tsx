import { useState, useEffect } from 'react'
import type { FC } from 'react'
import {
  resolveProviderSelection,
  useSessionStore,
  type ReasoningEffort,
} from '@/entities/session'
import { Composer } from './composer.presentational'

interface ComposerContainerProps {
  projectId: string
  workspaceId: string | null
  activeSessionId: string | null
}

export const ComposerContainer: FC<ComposerContainerProps> = ({
  projectId,
  workspaceId,
  activeSessionId,
}) => {
  const [value, setValue] = useState('')
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [effortId, setEffortId] = useState<ReasoningEffort | ''>('')
  const providers = useSessionStore((s) => s.providers)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const createAndStartSession = useSessionStore((s) => s.createAndStartSession)
  const sendMessageToSession = useSessionStore((s) => s.sendMessageToSession)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeProvider = providers.find(
    (p) => p.id === activeSession?.providerId,
  )
  const canContinueActiveSession =
    !!activeSession &&
    activeSession.status !== 'failed' &&
    !!activeProvider?.supportsContinuation
  const selection = resolveProviderSelection(
    providers,
    activeSession?.providerId ?? providerId,
    activeSession?.model ?? modelId,
    activeSession?.effort ?? (effortId || null),
  )

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  useEffect(() => {
    if (activeSession) {
      setProviderId(activeSession.providerId)
      setModelId(activeSession.model ?? '')
      setEffortId(activeSession.effort ?? '')
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

  const isSessionDone =
    !activeSession ||
    activeSession.status === 'completed' ||
    activeSession.status === 'failed'
  const isComposerDisabled =
    activeSession?.status === 'running' &&
    activeSession.attention !== 'needs-input'

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || !selection.providerId || !selection.modelId) return

    if (activeSession && canContinueActiveSession) {
      sendMessageToSession(activeSession.id, trimmed)
      setValue('')
      return
    }

    const name =
      trimmed.length > 40 ? trimmed.substring(0, 40) + '...' : trimmed
    createAndStartSession(
      projectId,
      workspaceId,
      selection.providerId,
      selection.modelId,
      selection.effort?.id ?? null,
      name,
      trimmed,
    )
    setValue('')
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
    <Composer
      value={value}
      onChange={setValue}
      onSubmit={handleSubmit}
      providers={providers}
      selection={selection}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onEffortChange={setEffortId}
      selectionDisabled={canContinueActiveSession}
      placeholder={
        activeSession?.attention === 'needs-input'
          ? 'Respond to the agent...'
          : canContinueActiveSession
            ? 'Send a follow-up...'
            : isSessionDone
              ? 'What would you like to work on?'
              : 'Session is running...'
      }
      disabled={isComposerDisabled}
    />
  )
}
