import { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useSessionStore } from '@/entities/session'
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

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  useEffect(() => {
    if (activeSession?.providerId) {
      setProviderId(activeSession.providerId)
      return
    }

    if (providers.length > 0 && !providerId) {
      const real = providers.find((p) => p.id !== 'fake')
      setProviderId(real?.id ?? providers[0].id)
    }
  }, [activeSession?.providerId, providers, providerId])

  const isSessionDone =
    !activeSession ||
    activeSession.status === 'completed' ||
    activeSession.status === 'failed'
  const isComposerDisabled =
    activeSession?.status === 'running' &&
    activeSession.attention !== 'needs-input'

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || !providerId) return

    if (activeSession && canContinueActiveSession) {
      sendMessageToSession(activeSession.id, trimmed)
      setValue('')
      return
    }

    const name =
      trimmed.length > 40 ? trimmed.substring(0, 40) + '...' : trimmed
    createAndStartSession(projectId, workspaceId, providerId, name, trimmed)
    setValue('')
  }

  return (
    <Composer
      value={value}
      onChange={setValue}
      onSubmit={handleSubmit}
      providers={providers}
      selectedProviderId={providerId}
      onProviderChange={setProviderId}
      providerSelectionDisabled={canContinueActiveSession}
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
