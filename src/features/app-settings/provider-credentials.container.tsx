import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react'
import {
  openRouterCredentialsApi,
  type OpenRouterCredentialStatus,
} from '@/entities/app-settings'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

function statusText(status: OpenRouterCredentialStatus | null): string {
  if (!status) return 'Checking...'
  if (status.error) return status.error
  if (!status.configured) return 'Not configured'
  if (status.source === 'environment') return 'Configured from environment'
  if (status.source === 'keychain') return 'Configured in Keychain, key hidden'
  return 'Configured'
}

export const ProviderCredentialsContainer: FC = () => {
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
        err instanceof Error ? err.message : 'Failed to load credential status',
      )
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleSave = useCallback(async () => {
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
          : 'Failed to save OpenRouter API key',
      )
    } finally {
      setIsSaving(false)
    }
  }, [token])

  const handleRemove = useCallback(async () => {
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
          : 'Failed to remove OpenRouter API key',
      )
    } finally {
      setIsSaving(false)
    }
  }, [])

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card/45 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">OpenRouter</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              {statusText(status)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isSaving || !status?.configured}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <label
            htmlFor="openrouter-api-key"
            className="text-xs font-medium text-muted-foreground"
          >
            API key
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                id="openrouter-api-key"
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                value={token}
                placeholder={
                  status?.configured ? 'Saved key hidden' : 'sk-or-...'
                }
                onChange={(event) => setToken(event.target.value)}
                disabled={isSaving}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9 w-9"
                aria-label={showToken ? 'Hide API key' : 'Show API key'}
                onClick={() => setShowToken((current) => !current)}
                disabled={isSaving}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || token.trim().length === 0}
            >
              {status?.configured ? 'Replace key' : 'Save key'}
            </Button>
          </div>
        </div>
      </section>

      {message && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      )}
      {error && (
        <p
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
