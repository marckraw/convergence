import type { FC } from 'react'
import { Eye, EyeOff, KeyRound, Trash2, Wifi } from 'lucide-react'
import type {
  ExecutionHostDaemonCredentialStatus,
  RemoteExecutionHostConnectionResult,
} from '@/entities/app-settings'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/cn.pure'
import { SettingsControlField } from './settings-control-field.presentational'

interface ExecutionHostFieldsProps {
  remoteBaseUrlDraft: string
  remoteBaseUrlError: string | null
  credentialStatus: ExecutionHostDaemonCredentialStatus | null
  daemonTokenDraft: string
  showDaemonToken: boolean
  isCredentialSaving: boolean
  isConnectionTesting: boolean
  credentialMessage: string | null
  credentialError: string | null
  connectionResult: RemoteExecutionHostConnectionResult | null
  onRemoteBaseUrlChange: (value: string) => void
  onDaemonTokenChange: (value: string) => void
  onToggleDaemonTokenVisibility: () => void
  onSaveDaemonToken: () => void
  onDeleteDaemonToken: () => void
  onTestDaemonConnection: () => void
}

function credentialStatusText(
  status: ExecutionHostDaemonCredentialStatus | null,
): string {
  if (!status) return 'Checking...'
  if (status.error) return status.error
  if (!status.configured) return 'Not configured'
  if (status.source === 'environment') return 'Configured from environment'
  if (status.source === 'keychain')
    return 'Configured in Keychain, token hidden'
  return 'Configured'
}

function connectionProvidersText(
  result: RemoteExecutionHostConnectionResult,
): string | null {
  if (!result.ok || !result.providers || result.providers.length === 0) {
    return null
  }
  return result.providers
    .map(
      (provider) =>
        `${provider.name}${provider.available && provider.authenticated ? '' : ' (unavailable)'}`,
    )
    .join(', ')
}

export const ExecutionHostFields: FC<ExecutionHostFieldsProps> = ({
  remoteBaseUrlDraft,
  remoteBaseUrlError,
  credentialStatus,
  daemonTokenDraft,
  showDaemonToken,
  isCredentialSaving,
  isConnectionTesting,
  credentialMessage,
  credentialError,
  connectionResult,
  onRemoteBaseUrlChange,
  onDaemonTokenChange,
  onToggleDaemonTokenVisibility,
  onSaveDaemonToken,
  onDeleteDaemonToken,
  onTestDaemonConnection,
}) => (
  <div className="space-y-4">
    <SettingsControlField
      title="Daemon base URL"
      description="Base URL for the agents daemon that can run provider sessions remotely. Leave empty to keep execution local."
    >
      <div className="space-y-2">
        <label
          htmlFor="execution-host-daemon-base-url"
          className="text-xs font-medium text-muted-foreground"
        >
          Execution host URL
        </label>
        <Input
          id="execution-host-daemon-base-url"
          value={remoteBaseUrlDraft}
          placeholder="https://daemon.example.com"
          onChange={(event) => onRemoteBaseUrlChange(event.target.value)}
          aria-invalid={!!remoteBaseUrlError}
          aria-describedby={
            remoteBaseUrlError
              ? 'execution-host-daemon-base-url-error'
              : undefined
          }
        />
        {remoteBaseUrlError && (
          <p
            id="execution-host-daemon-base-url-error"
            className="text-xs text-destructive"
            role="alert"
          >
            {remoteBaseUrlError}
          </p>
        )}
      </div>
    </SettingsControlField>

    <section className="rounded-xl border border-border bg-card/45 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Daemon API token</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            {credentialStatusText(credentialStatus)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Test execution host connection"
            onClick={onTestDaemonConnection}
            disabled={isCredentialSaving || isConnectionTesting}
          >
            <Wifi className="mr-2 h-4 w-4" />
            {isConnectionTesting ? 'Testing...' : 'Test connection'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Remove execution host token"
            onClick={onDeleteDaemonToken}
            disabled={isCredentialSaving || !credentialStatus?.configured}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove token
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <label
          htmlFor="execution-host-daemon-token"
          className="text-xs font-medium text-muted-foreground"
        >
          Execution host token
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              id="execution-host-daemon-token"
              type={showDaemonToken ? 'text' : 'password'}
              autoComplete="off"
              value={daemonTokenDraft}
              placeholder={
                credentialStatus?.configured
                  ? 'Saved token hidden'
                  : 'Bearer token'
              }
              onChange={(event) => onDaemonTokenChange(event.target.value)}
              disabled={isCredentialSaving}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-9 w-9"
              aria-label={
                showDaemonToken
                  ? 'Hide execution host token'
                  : 'Show execution host token'
              }
              onClick={onToggleDaemonTokenVisibility}
              disabled={isCredentialSaving}
            >
              {showDaemonToken ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <Button
            type="button"
            aria-label="Save execution host token"
            onClick={onSaveDaemonToken}
            disabled={
              isCredentialSaving || daemonTokenDraft.trim().length === 0
            }
          >
            {credentialStatus?.configured ? 'Replace token' : 'Save token'}
          </Button>
        </div>
      </div>

      {credentialMessage && (
        <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {credentialMessage}
        </p>
      )}
      {credentialError && (
        <p
          className={cn(
            'mt-4 rounded-xl border border-destructive/40 bg-destructive/10',
            'px-4 py-3 text-sm text-destructive',
          )}
          role="alert"
        >
          {credentialError}
        </p>
      )}
      {connectionResult && (
        <div
          className={cn(
            'mt-4 rounded-xl border px-4 py-3 text-sm',
            connectionResult.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          )}
          role={connectionResult.ok ? 'status' : 'alert'}
        >
          <p>{connectionResult.message}</p>
          {connectionProvidersText(connectionResult) && (
            <p className="mt-1 text-xs opacity-80">
              Providers: {connectionProvidersText(connectionResult)}
            </p>
          )}
        </div>
      )}
    </section>
  </div>
)
