import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  executionHostApi,
  executionHostDaemonCredentialsApi,
  type ExecutionHostDaemonCredentialStatus,
} from '@/entities/app-settings'
import type { ExecutionHostEndpoint } from '@/entities/execution-host'
import { ExecutionHostFields } from './execution-host-fields.presentational'
import {
  describeExecutionHostEndpointActionBlocks,
  describeExecutionHostEndpointRemoval,
  describeExecutionHostEndpointRemovalBlock,
  executionHostEndpointDisplayName,
  getExecutionHostEndpointBaseUrlError,
  normalizeExecutionHostBaseUrl,
  visibleExecutionHostConnectionResult,
  type ExecutionHostConnectionAttempt,
  type ExecutionHostEndpointDraft,
  type ExecutionHostSessionCounts,
} from './execution-host-settings.pure'

interface ExecutionHostSettingsContainerProps {
  draft: ExecutionHostEndpointDraft
  /** The stored Endpoint this row edits, or null while it is only typed. */
  saved: ExecutionHostEndpoint | null
  /** How many sessions name each Endpoint, and whether that is known yet. */
  sessionCounts: ExecutionHostSessionCounts
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
  sessionCounts,
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
  const [connectionAttempt, setConnectionAttempt] =
    useState<ExecutionHostConnectionAttempt | null>(null)
  // How many times this row has changed its own token. A connection result is
  // about the token that dialled, so the count is what a result is compared
  // against — never the token, which has no business leaving the main process.
  const [tokenGeneration, setTokenGeneration] = useState(0)
  const [isConnectionTesting, setIsConnectionTesting] = useState(false)
  const [isRemovalPending, setIsRemovalPending] = useState(false)

  const endpointId = draft.id
  const displayName = executionHostEndpointDisplayName(draft)
  const actionBlocks = useMemo(
    () => describeExecutionHostEndpointActionBlocks({ draft, saved }),
    [draft, saved],
  )
  const baseUrlError = getExecutionHostEndpointBaseUrlError(draft.baseUrl)
  // A row that was never saved has no sessions by construction: nothing can
  // name an Endpoint that does not exist, so no count is consulted at all —
  // neither to price its removal nor to hold it up.
  const removalBlock = saved
    ? describeExecutionHostEndpointRemovalBlock({
        label: draft.label,
        counts: sessionCounts,
      })
    : null
  const removalWarning =
    saved && sessionCounts.status !== 'counting'
      ? describeExecutionHostEndpointRemoval({
          label: draft.label,
          endpointId: draft.id,
          counts: sessionCounts,
        })
      : null
  const connectionResult = visibleExecutionHostConnectionResult({
    attempt: connectionAttempt,
    baseUrl: draft.baseUrl,
    tokenGeneration,
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
    // Counted from the moment the write is dispatched, not from its answer: a
    // save that fails partway through leaves a token nobody can vouch for, and
    // a test already in flight is dialling with the old one either way.
    setTokenGeneration((current) => current + 1)
    try {
      const next = await executionHostDaemonCredentialsApi.setToken(
        endpointId,
        daemonTokenDraft,
      )
      setCredentialStatus(next)
      setDaemonTokenDraft('')
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
    setTokenGeneration((current) => current + 1)
    try {
      const next =
        await executionHostDaemonCredentialsApi.deleteToken(endpointId)
      setCredentialStatus(next)
      setDaemonTokenDraft('')
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
    // What the answer will be about, read before dialling: the address on
    // screen and the token era doing the dialling. An answer that outlives
    // either of them is not an answer about anything on this row.
    const testedBaseUrl = normalizeExecutionHostBaseUrl(draft.baseUrl)
    const testedTokenGeneration = tokenGeneration
    try {
      setConnectionAttempt({
        baseUrl: testedBaseUrl,
        tokenGeneration: testedTokenGeneration,
        result: await executionHostApi.testRemoteConnection(endpointId),
      })
    } catch (err) {
      setConnectionAttempt({
        baseUrl: testedBaseUrl,
        tokenGeneration: testedTokenGeneration,
        result: {
          ok: false,
          state: 'daemon-error',
          baseUrl: null,
          message:
            err instanceof Error
              ? err.message
              : 'Failed to test daemon connection',
          providers: null,
          daemon: null,
        },
      })
    } finally {
      setIsConnectionTesting(false)
    }
  }, [draft.baseUrl, endpointId, tokenGeneration])

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
      removalBlock={removalBlock}
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
