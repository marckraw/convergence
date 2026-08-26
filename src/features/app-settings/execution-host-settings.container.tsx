import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  executionHostApi,
  executionHostDaemonCredentialsApi,
  type ExecutionHostDaemonCredentialStatus,
  type RemoteExecutionHostConnectionResult,
} from '@/entities/app-settings'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import { ExecutionHostFields } from './execution-host-fields.presentational'
import {
  describeExecutionHostEndpointActionBlocks,
  describeExecutionHostEndpointRemoval,
  executionHostEndpointDisplayName,
  getExecutionHostEndpointBaseUrlError,
  type ExecutionHostEndpointDraft,
} from './execution-host-settings.pure'

interface ExecutionHostSettingsContainerProps {
  draft: ExecutionHostEndpointDraft
  /** The stored Endpoint this row edits, or null while it is only typed. */
  saved: ExecutionHostEndpoint | null
  /** How many sessions name it; null when Convergence could not count. */
  sessionCount: number | null
  onLabelChange: (value: string) => void
  onRemoteBaseUrlChange: (value: string) => void
  onRemove: () => void
}

/**
 * One Endpoint's own token and its own connection test (MAR-2642).
 *
 * State is per instance and keyed by the Endpoint id, so two daemons cannot
 * share a status, a token draft or a test result. The credential calls name the
 * Endpoint at every hop (MAR-2629); nothing here may fall back to "the first
 * one", which is what made a second Endpoint impossible to configure.
 */
export const ExecutionHostSettingsContainer: FC<
  ExecutionHostSettingsContainerProps
> = ({
  draft,
  saved,
  sessionCount,
  onLabelChange,
  onRemoteBaseUrlChange,
  onRemove,
}) => {
  const [credentialStatus, setCredentialStatus] =
    useState<ExecutionHostDaemonCredentialStatus | null>(null)
  const [daemonTokenDraft, setDaemonTokenDraft] = useState('')
  const [showDaemonToken, setShowDaemonToken] = useState(false)
  const [isCredentialSaving, setIsCredentialSaving] = useState(false)
  const [credentialMessage, setCredentialMessage] = useState<string | null>(
    null,
  )
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [connectionResult, setConnectionResult] =
    useState<RemoteExecutionHostConnectionResult | null>(null)
  const [isConnectionTesting, setIsConnectionTesting] = useState(false)
  const [isRemovalPending, setIsRemovalPending] = useState(false)

  const endpointId = draft.id
  const displayName = executionHostEndpointDisplayName(draft)
  const actionBlocks = useMemo(
    () => describeExecutionHostEndpointActionBlocks({ draft, saved }),
    [draft, saved],
  )
  const baseUrlError = getExecutionHostEndpointBaseUrlError(draft.baseUrl)
  const removalWarning = describeExecutionHostEndpointRemoval({
    label: draft.label,
    // A row that was never saved has no sessions by construction, and the count
    // is about the stored Endpoint — reporting an unknown count for something
    // that cannot be named yet would invent a cost.
    sessionCount: saved ? sessionCount : 0,
  })

  const isTokenBlocked = !!actionBlocks.token

  const loadStatus = useCallback(async () => {
    try {
      setCredentialError(null)
      setCredentialStatus(
        await executionHostDaemonCredentialsApi.getStatus(endpointId),
      )
    } catch (err) {
      setCredentialError(
        err instanceof Error
          ? err.message
          : 'Failed to load daemon token status',
      )
    }
  }, [endpointId])

  useEffect(() => {
    // An unsaved row has no Endpoint to ask about: the main process refuses an
    // id it cannot find, and the refusal would read as a broken token.
    if (isTokenBlocked) {
      setCredentialStatus(null)
      return
    }
    void loadStatus()
  }, [loadStatus, isTokenBlocked])

  const handleSaveToken = useCallback(async () => {
    setIsCredentialSaving(true)
    setCredentialError(null)
    setCredentialMessage(null)
    try {
      const next = await executionHostDaemonCredentialsApi.setToken(
        endpointId,
        daemonTokenDraft,
      )
      setCredentialStatus(next)
      setDaemonTokenDraft('')
      setConnectionResult(null)
      setCredentialMessage('Daemon API token saved.')
    } catch (err) {
      setCredentialError(
        err instanceof Error ? err.message : 'Failed to save daemon API token',
      )
    } finally {
      setIsCredentialSaving(false)
    }
  }, [daemonTokenDraft, endpointId])

  const handleDeleteToken = useCallback(async () => {
    setIsCredentialSaving(true)
    setCredentialError(null)
    setCredentialMessage(null)
    try {
      const next =
        await executionHostDaemonCredentialsApi.deleteToken(endpointId)
      setCredentialStatus(next)
      setDaemonTokenDraft('')
      setConnectionResult(null)
      setCredentialMessage('Daemon API token removed.')
    } catch (err) {
      setCredentialError(
        err instanceof Error
          ? err.message
          : 'Failed to remove daemon API token',
      )
    } finally {
      setIsCredentialSaving(false)
    }
  }, [endpointId])

  const handleTestConnection = useCallback(async () => {
    setIsConnectionTesting(true)
    setCredentialError(null)
    setCredentialMessage(null)
    try {
      setConnectionResult(
        await executionHostApi.testRemoteConnection(endpointId),
      )
    } catch (err) {
      setConnectionResult({
        ok: false,
        state: 'daemon-error',
        baseUrl: null,
        message:
          err instanceof Error
            ? err.message
            : 'Failed to test daemon connection',
        providers: null,
        daemon: null,
      })
    } finally {
      setIsConnectionTesting(false)
    }
  }, [endpointId])

  const handleRequestRemove = useCallback(() => {
    // Nothing names it and nothing is stored: removing costs nothing, so
    // asking would be ceremony rather than honesty.
    if (!removalWarning) {
      onRemove()
      return
    }
    setIsRemovalPending(true)
  }, [onRemove, removalWarning])

  const handleConfirmRemove = useCallback(() => {
    setIsRemovalPending(false)
    onRemove()
  }, [onRemove])

  return (
    <ExecutionHostFields
      endpointId={endpointId}
      displayName={displayName}
      labelDraft={draft.label}
      remoteBaseUrlDraft={draft.baseUrl}
      remoteBaseUrlError={baseUrlError}
      actionBlocks={actionBlocks}
      credentialStatus={credentialStatus}
      daemonTokenDraft={daemonTokenDraft}
      showDaemonToken={showDaemonToken}
      isCredentialSaving={isCredentialSaving}
      isConnectionTesting={isConnectionTesting}
      credentialMessage={credentialMessage}
      credentialError={credentialError}
      connectionResult={connectionResult}
      removalWarning={removalWarning}
      isRemovalPending={isRemovalPending}
      onLabelChange={onLabelChange}
      onRemoteBaseUrlChange={onRemoteBaseUrlChange}
      onDaemonTokenChange={setDaemonTokenDraft}
      onToggleDaemonTokenVisibility={() =>
        setShowDaemonToken((current) => !current)
      }
      onSaveDaemonToken={handleSaveToken}
      onDeleteDaemonToken={handleDeleteToken}
      onTestDaemonConnection={handleTestConnection}
      onRequestRemove={handleRequestRemove}
      onConfirmRemove={handleConfirmRemove}
      onCancelRemove={() => setIsRemovalPending(false)}
    />
  )
}
