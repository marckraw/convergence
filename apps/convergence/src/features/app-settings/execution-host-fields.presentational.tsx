import type { FC } from 'react'
import { Trash2, Wifi } from 'lucide-react'
import type {
  ExecutionHostDaemonCredentialStatus,
  RemoteExecutionHostConnectionResult,
} from '@/entities/app-settings'
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Notice,
} from '@convergence/ui'
import type { ExecutionHostEndpointActionBlocks } from './execution-host-settings.pure'
import { SecretField } from './secret-field.presentational'

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
  onLabelChange: (value: string) => void
  onRemoteBaseUrlChange: (value: string) => void
  onDaemonTokenChange: (value: string) => void
  onToggleDaemonTokenVisibility: () => void
  onSaveDaemonToken: () => void
  onDeleteDaemonToken: () => void
  onTestDaemonConnection: () => void
  /** Remove: it asks first when the endpoint is stored (R5). */
  onRequestRemove: () => void
}

function credentialStatusText(
  status: ExecutionHostDaemonCredentialStatus | null,
  tokenBlock: string | null,
): string {
  if (tokenBlock) return tokenBlock
  if (!status) return 'Checking…'
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

/** A block's head: its name and status at the start, its actions at the end. */
const blockHead = 'flex items-start justify-between gap-4'

/**
 * One Endpoint: its name, its address, its own token and its own connection
 * test (MAR-2642). Every control is named for its endpoint so nothing on this
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
  onLabelChange,
  onRemoteBaseUrlChange,
  onDaemonTokenChange,
  onToggleDaemonTokenVisibility,
  onSaveDaemonToken,
  onDeleteDaemonToken,
  onTestDaemonConnection,
  onRequestRemove,
}) => (
  <section
    data-endpoint-id={endpointId}
    className="space-y-4 rounded-2xl border border-line bg-surface/45 p-4"
  >
    <div className={blockHead}>
      <Field className="min-w-0 flex-1">
        <FieldLabel>Endpoint name</FieldLabel>
        <Input
          size="lg"
          value={labelDraft}
          placeholder="kuba-vps"
          onChange={(event) => onLabelChange(event.target.value)}
        />
      </Field>
      <Button
        type="button"
        variant="ghost"
        aria-label={`Remove endpoint ${displayName}`}
        onClick={onRequestRemove}
        disabledReason={removalBlock ?? undefined}
        className="mt-6 shrink-0"
      >
        <Trash2 className="size-4" />
        Remove
      </Button>
    </div>

    <Field invalid={!!remoteBaseUrlError}>
      <FieldLabel>Execution host URL</FieldLabel>
      <Input
        size="lg"
        value={remoteBaseUrlDraft}
        placeholder="https://daemon.example.com"
        onChange={(event) => onRemoteBaseUrlChange(event.target.value)}
      />
      {remoteBaseUrlError ? (
        <FieldError match reserve={false}>
          {remoteBaseUrlError}
        </FieldError>
      ) : null}
    </Field>

    <SecretField
      title="Daemon API token"
      status={credentialStatusText(credentialStatus, actionBlocks.token)}
      label="Execution host token"
      noun="token"
      owner={displayName}
      value={daemonTokenDraft}
      placeholder={
        credentialStatus?.configured ? 'Saved token hidden' : 'Bearer token'
      }
      revealed={showDaemonToken}
      configured={credentialStatus?.configured ?? false}
      saving={isCredentialSaving}
      blocked={actionBlocks.token}
      actions={
        <Button
          type="button"
          variant="secondary"
          aria-label={`Test connection for ${displayName}`}
          onClick={onTestDaemonConnection}
          disabled={isCredentialSaving || isConnectionTesting}
          disabledReason={actionBlocks.connection ?? undefined}
          pending={isConnectionTesting}
          pendingLabel="Testing…"
        >
          <Wifi className="size-4" />
          Test connection
        </Button>
      }
      note={
        actionBlocks.connection && !actionBlocks.token ? (
          <p className="mt-3 text-xs text-ink-muted">
            {actionBlocks.connection}
          </p>
        ) : null
      }
      onValueChange={onDaemonTokenChange}
      onToggleReveal={onToggleDaemonTokenVisibility}
      onSave={onSaveDaemonToken}
      onRemove={onDeleteDaemonToken}
    >
      {credentialMessage && (
        <Notice tone="success" title={credentialMessage} className="mt-4" />
      )}
      {credentialError && (
        <Notice tone="danger" title={credentialError} className="mt-4" />
      )}
      {connectionResult && (
        <Notice
          tone={connectionResult.ok ? 'success' : 'danger'}
          title={connectionResult.message}
          className="mt-4"
        >
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
            <p className="mt-1 text-xs wrap-break-word opacity-80">
              {connectionCapabilitiesText(connectionResult)}
            </p>
          )}
        </Notice>
      )}
    </SecretField>
  </section>
)
