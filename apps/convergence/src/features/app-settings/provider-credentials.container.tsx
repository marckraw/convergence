import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react'
import {
  openRouterCredentialsApi,
  type OpenRouterCredentialStatus,
} from '@/entities/app-settings'
import {
  Button,
  Card,
  Field,
  FieldLabel,
  IconButton,
  Input,
  Notice,
  useConfirm,
} from '@convergence/ui'

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
      <Card render={<section />} padding="md">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <KeyRound aria-hidden className="size-4 text-ink-muted" />
              <h4 className="text-sm font-semibold">OpenRouter</h4>
            </div>
            <p className="text-sm text-ink-muted">{statusText(status)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={handleRemove}
            disabled={isSaving}
            disabledReason={
              !isSaving && !status?.configured ? 'No key is saved.' : undefined
            }
          >
            <Trash2 className="size-4" />
            Remove key…
          </Button>
        </div>

        <Field className="mt-4">
          <FieldLabel>API key</FieldLabel>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                size="lg"
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                value={token}
                placeholder={
                  status?.configured ? 'Saved key hidden' : 'sk-or-…'
                }
                onChange={(event) => setToken(event.target.value)}
                disabled={isSaving}
                className="pr-10"
              />
              <IconButton
                label={showToken ? 'Hide API key' : 'Show API key'}
                type="button"
                variant="ghost"
                onClick={() => setShowToken((current) => !current)}
                disabled={isSaving}
                size="lg"
                className="absolute right-0 top-0"
              >
                {showToken ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </IconButton>
            </div>
            <Button
              type="button"
              onClick={handleSave}
              pending={isSaving}
              pendingLabel="Saving…"
              disabledReason={
                !isSaving && token.trim().length === 0
                  ? 'Paste a key first.'
                  : undefined
              }
              size="lg"
            >
              {status?.configured ? 'Replace key' : 'Save key'}
            </Button>
          </div>
        </Field>
      </Card>

      {message ? <Notice tone="success" title={message} /> : null}
      {error ? <Notice tone="danger" title={error} /> : null}
    </div>
  )
}
