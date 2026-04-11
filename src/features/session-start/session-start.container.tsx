import { useState, useEffect } from 'react'
import type { FC } from 'react'
import { useSessionStore } from '@/entities/session'
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
  const providers = useSessionStore((s) => s.providers)
  const loadProviders = useSessionStore((s) => s.loadProviders)
  const createAndStartSession = useSessionStore((s) => s.createAndStartSession)

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  useEffect(() => {
    if (providers.length > 0 && !providerId) {
      setProviderId(providers[0].id)
    }
  }, [providers, providerId])

  const handleSubmit = () => {
    if (!name.trim() || !message.trim() || !providerId) return
    createAndStartSession(
      projectId,
      workspaceId,
      providerId,
      name.trim(),
      message.trim(),
    )
    setName('')
    setMessage('')
  }

  return (
    <SessionStartForm
      name={name}
      message={message}
      providers={providers}
      selectedProviderId={providerId}
      onNameChange={setName}
      onMessageChange={setMessage}
      onProviderChange={setProviderId}
      onSubmit={handleSubmit}
    />
  )
}
