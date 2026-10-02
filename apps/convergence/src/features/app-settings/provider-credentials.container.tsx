import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import {
  openRouterCredentialsApi,
  type OpenRouterCredentialStatus,
} from '@/entities/app-settings'
import { Notice, useConfirm } from '@convergence/ui'
import { SecretField } from './secret-field.presentational'

function statusText(status: OpenRouterCredentialStatus | null): string {
  if (!status) return 'Checking…'
  if (status.error) return status.error
  if (!status.configured) return 'Not configured'
  if (status.source === 'environment') return 'Configured from environment'
  if (status.source === 'keychain') return 'Configured in Keychain, key hidden'
  return 'Configured'
}

export const ProviderCredentialsContainer: FC = () => {
  // What can't be taken back asks first, in the app's own dialog (R5).
  const confirm = useConfirm()
  const [status, setStatus] = useState<OpenRouterCredentialStatus | null>(null)
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      setError(null)
      setStatus(await openRouterCredentialsApi.getStatus())
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Couldn’t read the credential status.',
      )
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleSave = useCallback(async () => {
    // Busy, the button stays where it is; a second press waits for the first.
    if (isSaving || token.trim().length === 0) return
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await openRouterCredentialsApi.setToken(token)
      setStatus(next)
      setToken('')
      setMessage('OpenRouter API key saved.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Couldn’t save the OpenRouter API key.',
      )
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, token])

  const handleRemove = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Remove the OpenRouter API key?',
      description:
        'It is deleted from the macOS keychain. You can add a key again at any time.',
      confirmLabel: 'Remove key',
      variant: 'danger',
    })
    if (!confirmed) return
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await openRouterCredentialsApi.deleteToken()
      setStatus(next)
      setToken('')
      setMessage('OpenRouter API key removed.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Couldn’t remove the OpenRouter API key.',
      )
    } finally {
      setIsSaving(false)
    }
  }, [confirm])

  return (
    <div className="space-y-4">
      <SecretField
        title="OpenRouter"
        status={statusText(status)}
        label="API key"
        noun="key"
        value={token}
        placeholder={status?.configured ? 'Saved key hidden' : 'sk-or-…'}
        revealed={showToken}
        configured={status?.configured ?? false}
        saving={isSaving}
        onValueChange={setToken}
        onToggleReveal={() => setShowToken((current) => !current)}
        onSave={() => void handleSave()}
        onRemove={() => void handleRemove()}
      />

      {message ? <Notice tone="success" title={message} /> : null}
      {error ? <Notice tone="danger" title={error} /> : null}
    </div>
  )
}
