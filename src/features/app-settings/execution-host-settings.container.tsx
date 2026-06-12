import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import {
  executionHostApi,
  executionHostDaemonCredentialsApi,
  type ExecutionHostDaemonCredentialStatus,
  type RemoteExecutionHostConnectionResult,
} from '@/entities/app-settings'
import { ExecutionHostFields } from './execution-host-fields.presentational'

interface ExecutionHostSettingsContainerProps {
  remoteBaseUrlDraft: string
  remoteBaseUrlError: string | null
  onRemoteBaseUrlChange: (value: string) => void
}

export const ExecutionHostSettingsContainer: FC<
  ExecutionHostSettingsContainerProps
> = ({ remoteBaseUrlDraft, remoteBaseUrlError, onRemoteBaseUrlChange }) => {
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

  const loadStatus = useCallback(async () => {
    try {
      setCredentialError(null)
      setCredentialStatus(await executionHostDaemonCredentialsApi.getStatus())
    } catch (err) {
      setCredentialError(
        err instanceof Error
          ? err.message
          : 'Failed to load daemon token status',
      )
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleSaveToken = useCallback(async () => {
    setIsCredentialSaving(true)
    setCredentialError(null)
    setCredentialMessage(null)
    try {
      const next =
        await executionHostDaemonCredentialsApi.setToken(daemonTokenDraft)
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
  }, [daemonTokenDraft])

  const handleDeleteToken = useCallback(async () => {
    setIsCredentialSaving(true)
    setCredentialError(null)
    setCredentialMessage(null)
    try {
      const next = await executionHostDaemonCredentialsApi.deleteToken()
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
  }, [])

  const handleTestConnection = useCallback(async () => {
    setIsConnectionTesting(true)
    setCredentialError(null)
    setCredentialMessage(null)
    try {
      setConnectionResult(await executionHostApi.testRemoteConnection())
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
      })
    } finally {
      setIsConnectionTesting(false)
    }
  }, [])

  return (
    <ExecutionHostFields
      remoteBaseUrlDraft={remoteBaseUrlDraft}
      remoteBaseUrlError={remoteBaseUrlError}
      credentialStatus={credentialStatus}
      daemonTokenDraft={daemonTokenDraft}
      showDaemonToken={showDaemonToken}
      isCredentialSaving={isCredentialSaving}
      isConnectionTesting={isConnectionTesting}
      credentialMessage={credentialMessage}
      credentialError={credentialError}
      connectionResult={connectionResult}
      onRemoteBaseUrlChange={onRemoteBaseUrlChange}
      onDaemonTokenChange={setDaemonTokenDraft}
      onToggleDaemonTokenVisibility={() =>
        setShowDaemonToken((current) => !current)
      }
      onSaveDaemonToken={handleSaveToken}
      onDeleteDaemonToken={handleDeleteToken}
      onTestDaemonConnection={handleTestConnection}
    />
  )
}
