import type { FC } from 'react'
import { Eye, EyeOff, KeyRound, Trash2, Wifi } from 'lucide-react'
import type {
  ExecutionHostDaemonCredentialStatus,
  RemoteExecutionHostConnectionResult,
} from '@/entities/app-settings'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/lib/cn.pure'
import type { ExecutionHostEndpointActionBlocks } from './execution-host-settings.pure'

interface ExecutionHostFieldsProps {
  endpointId: string
  displayName: string
  labelDraft: string
  remoteBaseUrlDraft: string
  remoteBaseUrlError: string | null
  actionBlocks: ExecutionHostEndpointActionBlocks
  /** Why Remove cannot act yet, or null when it can. */
  removalBlock: string | null
  credentialStatus: ExecutionHostDaemonCredentialStatus | null
  daemonTokenDraft: string
  showDaemonToken: boolean
  isCredentialSaving: boolean
  isConnectionTesting: boolean
  credentialMessage: string | null
  credentialError: string | null
  connectionResult: RemoteExecutionHostConnectionResult | null
  removalWarning: string | null
  isRemovalPending: boolean
  onLabelChange: (value: string) => void
  onRemoteBaseUrlChange: (value: string) => void
  onDaemonTokenChange: (value: string) => void
  onToggleDaemonTokenVisibility: () => void
  onSaveDaemonToken: () => void
  onDeleteDaemonToken: () => void
  onTestDaemonConnection: () => void
  onRequestRemove: () => void
  onConfirmRemove: () => void
  onCancelRemove: () => void
}

function credentialStatusText(
  status: ExecutionHostDaemonCredentialStatus | null,
  tokenBlock: string | null,
): string {
  if (tokenBlock) return tokenBlock
  if (!status) return 'Checking...'
  if (status.error) return status.error
  if (!status.configured) return 'Not configured'
  if (status.source === 'environment') return 'Configured from environment'
  if (status.source === 'keychain')
    return 'Configured in Keychain, token hidden'
  return 'Configured'
}

/**
 * What the daemon said about itself, when it said anything. A daemon that
 * serves no `/health` reports null here, and the line is simply absent — an
 * unknown version must not be dressed up as an answer.
 */
function connectionDaemonText(
  result: RemoteExecutionHostConnectionResult,
): string | null {
  const daemon = result.daemon
  if (!daemon) return null
  const parts = [`agents-daemon ${daemon.version ?? 'unknown version'}`]
  if (daemon.apiVersion) parts.push(`API ${daemon.apiVersion}`)
  return parts.join(' · ')
}

function connectionCapabilitiesText(
  result: RemoteExecutionHostConnectionResult,
): string | null {
  const capabilities = result.daemon?.protocolCapabilities
  if (!capabilities) return null
  if (capabilities.length === 0) {
    return 'No execution protocol capabilities advertised'
  }
  return `${capabilities.length} execution protocol capabilities: ${capabilities.join(', ')}`
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

/**
 * One Endpoint: its name, its address, its own token and its own connection
 * test (MAR-2642). Every control is scoped by `endpointId` so nothing on this
 * card can reach another machine's token by accident.
 */
export const ExecutionHostFields: FC<ExecutionHostFieldsProps> = ({
  endpointId,
  displayName,
  labelDraft,
  remoteBaseUrlDraft,
  remoteBaseUrlError,
  actionBlocks,
  removalBlock,
  credentialStatus,
  daemonTokenDraft,
  showDaemonToken,
  isCredentialSaving,
  isConnectionTesting,
  credentialMessage,
  credentialError,
  connectionResult,
  removalWarning,
  isRemovalPending,
  onLabelChange,
  onRemoteBaseUrlChange,
  onDaemonTokenChange,
  onToggleDaemonTokenVisibility,
  onSaveDaemonToken,
  onDeleteDaemonToken,
  onTestDaemonConnection,
  onRequestRemove,
  onConfirmRemove,
  onCancelRemove,
}) => (
  <section className="space-y-4 rounded-2xl border border-border bg-card/45 p-4">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-2">
        <label
          htmlFor={`execution-host-label-${endpointId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Endpoint name
        </label>
        <Input
          id={`execution-host-label-${endpointId}`}
          value={labelDraft}
          placeholder="kuba-vps"
          onChange={(event) => onLabelChange(event.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-6 shrink-0"
        aria-label={`Remove endpoint ${displayName}`}
        title={removalBlock ?? undefined}
        onClick={onRequestRemove}
        disabled={isRemovalPending || !!removalBlock}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Remove
      </Button>
    </div>

    {isRemovalPending && (
      <div
        className={cn(
          'space-y-3 rounded-xl border border-destructive/40',
          'bg-destructive/10 px-4 py-3 text-sm text-destructive',
        )}
        role="alert"
      >
        <p>{removalWarning}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            aria-label={`Confirm removing endpoint ${displayName}`}
            onClick={onConfirmRemove}
          >
            Remove anyway
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Keep endpoint ${displayName}`}
            onClick={onCancelRemove}
          >
            Keep it
          </Button>
        </div>
      </div>
    )}

    <div className="space-y-2">
      <label
        htmlFor={`execution-host-daemon-base-url-${endpointId}`}
        className="text-xs font-medium text-muted-foreground"
      >
        Execution host URL
      </label>
      <Input
        id={`execution-host-daemon-base-url-${endpointId}`}
        value={remoteBaseUrlDraft}
        placeholder="https://daemon.example.com"
        onChange={(event) => onRemoteBaseUrlChange(event.target.value)}
        aria-invalid={!!remoteBaseUrlError}
        aria-describedby={
          remoteBaseUrlError
            ? `execution-host-daemon-base-url-error-${endpointId}`
            : undefined
        }
      />
      {remoteBaseUrlError && (
        <p
          id={`execution-host-daemon-base-url-error-${endpointId}`}
          className="text-xs text-destructive"
          role="alert"
        >
          {remoteBaseUrlError}
        </p>
      )}
    </div>

    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Daemon API token</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            {credentialStatusText(credentialStatus, actionBlocks.token)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Test connection for ${displayName}`}
            title={actionBlocks.connection ?? undefined}
            onClick={onTestDaemonConnection}
            disabled={
              isCredentialSaving ||
              isConnectionTesting ||
              !!actionBlocks.connection
            }
          >
            <Wifi className="mr-2 h-4 w-4" />
            {isConnectionTesting ? 'Testing...' : 'Test connection'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove token for ${displayName}`}
            onClick={onDeleteDaemonToken}
            disabled={
              isCredentialSaving ||
              !!actionBlocks.token ||
              !credentialStatus?.configured
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove token
          </Button>
        </div>
      </div>

      {actionBlocks.connection && !actionBlocks.token && (
        <p className="mt-3 text-xs text-muted-foreground">
          {actionBlocks.connection}
        </p>
      )}

      <div className="mt-4 space-y-2">
        <label
          htmlFor={`execution-host-daemon-token-${endpointId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Execution host token
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              id={`execution-host-daemon-token-${endpointId}`}
              type={showDaemonToken ? 'text' : 'password'}
              autoComplete="off"
              value={daemonTokenDraft}
              placeholder={
                credentialStatus?.configured
                  ? 'Saved token hidden'
                  : 'Bearer token'
              }
              onChange={(event) => onDaemonTokenChange(event.target.value)}
              disabled={isCredentialSaving || !!actionBlocks.token}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              // The eye is 36px to match the field it sits in; the pseudo
              // element takes the pointer target to 40x40 without moving
              // anything visible.
              className={cn(
                'absolute right-0 top-0 h-9 w-9',
                "before:absolute before:-inset-0.5 before:content-['']",
              )}
              aria-label={
                showDaemonToken
                  ? `Hide token for ${displayName}`
                  : `Show token for ${displayName}`
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
            aria-label={`Save token for ${displayName}`}
            onClick={onSaveDaemonToken}
            disabled={
              isCredentialSaving ||
              !!actionBlocks.token ||
              daemonTokenDraft.trim().length === 0
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
          {connectionDaemonText(connectionResult) && (
            <p className="mt-1 text-xs opacity-80">
              {connectionDaemonText(connectionResult)}
            </p>
          )}
          {connectionProvidersText(connectionResult) && (
            <p className="mt-1 text-xs opacity-80">
              Providers: {connectionProvidersText(connectionResult)}
            </p>
          )}
          {connectionCapabilitiesText(connectionResult) && (
            <p className="mt-1 break-words text-xs opacity-80">
              {connectionCapabilitiesText(connectionResult)}
            </p>
          )}
        </div>
      )}
    </div>
  </section>
)
