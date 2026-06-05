import { useCallback, useEffect, useState } from 'react'
import type { FC } from 'react'
import {
  guidedReviewDaemonCredentialsApi,
  type GuidedReviewBackend,
  type GuidedReviewDaemonCredentialStatus,
} from '@/entities/app-settings'
import {
  codeReviewGuideApi,
  type RemoteCodeReviewDaemonConnectionResult,
} from '@/entities/code-review-guide'
import type { ProviderInfo } from '@/entities/session'
import { GuidedReviewGenerationFields } from './guided-review-generation-fields.presentational'
import { GuidedReviewModelDefaultsFields } from './guided-review-model-defaults.presentational'

interface GuidedReviewSettingsContainerProps {
  providers: ProviderInfo[]
  guidedReviewDraft: Record<string, string>
  backend: GuidedReviewBackend
  remoteBaseUrlDraft: string
  remoteBaseUrlError: string | null
  onGuidedReviewModelChange: (providerId: string, modelId: string) => void
  onBackendChange: (backend: GuidedReviewBackend) => void
  onRemoteBaseUrlChange: (value: string) => void
}

export const GuidedReviewSettingsContainer: FC<
  GuidedReviewSettingsContainerProps
> = ({
  providers,
  guidedReviewDraft,
  backend,
  remoteBaseUrlDraft,
  remoteBaseUrlError,
  onGuidedReviewModelChange,
  onBackendChange,
  onRemoteBaseUrlChange,
}) => {
  const [credentialStatus, setCredentialStatus] =
    useState<GuidedReviewDaemonCredentialStatus | null>(null)
  const [daemonTokenDraft, setDaemonTokenDraft] = useState('')
  const [showDaemonToken, setShowDaemonToken] = useState(false)
  const [isCredentialSaving, setIsCredentialSaving] = useState(false)
  const [credentialMessage, setCredentialMessage] = useState<string | null>(
    null,
  )
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [connectionResult, setConnectionResult] =
    useState<RemoteCodeReviewDaemonConnectionResult | null>(null)
  const [isConnectionTesting, setIsConnectionTesting] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      setCredentialError(null)
      setCredentialStatus(await guidedReviewDaemonCredentialsApi.getStatus())
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
        await guidedReviewDaemonCredentialsApi.setToken(daemonTokenDraft)
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
      const next = await guidedReviewDaemonCredentialsApi.deleteToken()
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
      setConnectionResult(await codeReviewGuideApi.testRemoteDaemonConnection())
    } catch (err) {
      setConnectionResult({
        ok: false,
        state: 'daemon-error',
        baseUrl: null,
        message:
          err instanceof Error
            ? err.message
            : 'Failed to test daemon connection',
        health: null,
        meta: null,
      })
    } finally {
      setIsConnectionTesting(false)
    }
  }, [])

  return (
    <div className="space-y-5">
      <GuidedReviewGenerationFields
        backend={backend}
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
        onBackendChange={onBackendChange}
        onRemoteBaseUrlChange={onRemoteBaseUrlChange}
        onDaemonTokenChange={setDaemonTokenDraft}
        onToggleDaemonTokenVisibility={() =>
          setShowDaemonToken((current) => !current)
        }
        onSaveDaemonToken={handleSaveToken}
        onDeleteDaemonToken={handleDeleteToken}
        onTestDaemonConnection={handleTestConnection}
      />

      <GuidedReviewModelDefaultsFields
        providers={providers}
        guidedReviewDraft={guidedReviewDraft}
        onGuidedReviewModelChange={onGuidedReviewModelChange}
      />
    </div>
  )
}
