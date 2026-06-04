import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react'
import {
  cursorCredentialsApi,
  openRouterCredentialsApi,
  type CursorCredentialStatus,
  type OpenRouterCredentialStatus,
} from '@/entities/app-settings'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { formatProviderCredentialStatus } from './provider-credentials.pure'

export const ProviderCredentialsContainer: FC = () => {
  const [openRouterStatus, setOpenRouterStatus] =
    useState<OpenRouterCredentialStatus | null>(null)
  const [openRouterToken, setOpenRouterToken] = useState('')
  const [showOpenRouterToken, setShowOpenRouterToken] = useState(false)
  const [cursorStatus, setCursorStatus] =
    useState<CursorCredentialStatus | null>(null)
  const [cursorApiKey, setCursorApiKey] = useState('')
  const [cursorEmail, setCursorEmail] = useState('')
  const [showCursorApiKey, setShowCursorApiKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      setError(null)
      const [openRouter, cursor] = await Promise.all([
        openRouterCredentialsApi.getStatus(),
        cursorCredentialsApi.getStatus(),
      ])
      setOpenRouterStatus(openRouter)
      setCursorStatus(cursor)
      setCursorEmail(cursor.email ?? '')
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
      const next = await openRouterCredentialsApi.setToken(openRouterToken)
      setOpenRouterStatus(next)
      setOpenRouterToken('')
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
  }, [openRouterToken])

  const handleRemove = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await openRouterCredentialsApi.deleteToken()
      setOpenRouterStatus(next)
      setOpenRouterToken('')
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

  const handleSaveCursor = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await cursorCredentialsApi.setCredentials(
        cursorApiKey,
        cursorEmail,
      )
      setCursorStatus(next)
      setCursorApiKey('')
      setCursorEmail(next.email ?? '')
      setMessage('Cursor Admin API credentials saved.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save Cursor Admin API credentials',
      )
    } finally {
      setIsSaving(false)
    }
  }, [cursorApiKey, cursorEmail])

  const handleRemoveCursor = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await cursorCredentialsApi.deleteCredentials()
      setCursorStatus(next)
      setCursorApiKey('')
      setCursorEmail(next.email ?? '')
      setMessage('Cursor Admin API credentials removed.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to remove Cursor Admin API credentials',
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
              {formatProviderCredentialStatus(openRouterStatus)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isSaving || !openRouterStatus?.configured}
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
            OpenRouter API key
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                id="openrouter-api-key"
                type={showOpenRouterToken ? 'text' : 'password'}
                autoComplete="off"
                value={openRouterToken}
                placeholder={
                  openRouterStatus?.configured
                    ? 'Saved key hidden'
                    : 'sk-or-...'
                }
                onChange={(event) => setOpenRouterToken(event.target.value)}
                disabled={isSaving}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9 w-9"
                aria-label={
                  showOpenRouterToken
                    ? 'Hide OpenRouter API key'
                    : 'Show OpenRouter API key'
                }
                onClick={() => setShowOpenRouterToken((current) => !current)}
                disabled={isSaving}
              >
                {showOpenRouterToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || openRouterToken.trim().length === 0}
            >
              {openRouterStatus?.configured
                ? 'Replace OpenRouter key'
                : 'Save OpenRouter key'}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/45 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">Cursor Admin API</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatProviderCredentialStatus(cursorStatus)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemoveCursor}
            disabled={isSaving || !cursorStatus?.configured}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <label
              htmlFor="cursor-admin-api-key"
              className="text-xs font-medium text-muted-foreground"
            >
              Cursor Admin API key
            </label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Input
                  id="cursor-admin-api-key"
                  type={showCursorApiKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={cursorApiKey}
                  placeholder={
                    cursorStatus?.configured ? 'Saved key hidden' : 'key_...'
                  }
                  onChange={(event) => setCursorApiKey(event.target.value)}
                  disabled={isSaving}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-9 w-9"
                  aria-label={
                    showCursorApiKey
                      ? 'Hide Cursor Admin API key'
                      : 'Show Cursor Admin API key'
                  }
                  onClick={() => setShowCursorApiKey((current) => !current)}
                  disabled={isSaving}
                >
                  {showCursorApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button
                type="button"
                onClick={handleSaveCursor}
                disabled={isSaving || cursorApiKey.trim().length === 0}
              >
                {cursorStatus?.configured
                  ? 'Replace Cursor key'
                  : 'Save Cursor key'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cursor usage is only machine-readable for Cursor teams. Team
              admins can create a key from Dashboard &gt; Settings &gt; Cursor
              Admin API Keys; those keys start with key_. Personal Pro accounts
              and crsr_ User API Keys do not expose usage data to Convergence.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="cursor-usage-email"
              className="text-xs font-medium text-muted-foreground"
            >
              Cursor usage email
            </label>
            <Input
              id="cursor-usage-email"
              type="email"
              autoComplete="off"
              value={cursorEmail}
              placeholder="developer@example.com"
              onChange={(event) => setCursorEmail(event.target.value)}
              disabled={isSaving || cursorStatus?.emailSource === 'environment'}
            />
            <p className="text-xs text-muted-foreground">
              Used to select your member row when the Admin API returns a team.
            </p>
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
