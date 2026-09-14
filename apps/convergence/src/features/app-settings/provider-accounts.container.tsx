import type { ProviderAccountLoginAttempt } from '@/shared/types/provider-account-login.types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  buildProviderAccountSettingsRows,
  providerAccountApi,
  providerAccountsForProvider,
  type ProviderAccount,
  type ProviderAccountEnrollmentProvider,
  type ProviderAccountConnectors,
  type ProviderAccountHealth,
  type ClaudeAccountLayout,
} from '@/entities/provider-account'
import { useDialogStore } from '@/entities/dialog'
import { ProviderAccountsFields } from './provider-accounts.presentational'

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * The provider-accounts settings surface (ADR 0007, PA6).
 *
 * Enrolment stops being a developer-console incantation here. Every action is
 * a one-way door against a real credential store — login opens a browser,
 * removal signs the account out — so each runs against the account it names and
 * reports what happened rather than refreshing silently.
 */
export const ProviderAccountsContainer: FC = () => {
  const dialogPayload = useDialogStore((state) => state.payload)
  const [providerId, setProviderId] =
    useState<ProviderAccountEnrollmentProvider>(() =>
      dialogPayload && 'appSettingsSection' in dialogPayload
        ? (dialogPayload.providerAccountProviderId ?? 'claude-code')
        : 'claude-code',
    )
  const [loginAttempt, setLoginAttempt] =
    useState<ProviderAccountLoginAttempt | null>(null)
  const [loginCode, setLoginCode] = useState('')
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])
  const [health, setHealth] = useState<ProviderAccountHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null)
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [enrolEmail, setEnrolEmail] = useState('')
  const [enrolLabel, setEnrolLabel] = useState('')
  const [renamingAccountId, setRenamingAccountId] = useState<string | null>(
    null,
  )
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmingRemovalAccountId, setConfirmingRemovalAccountId] = useState<
    string | null
  >(null)
  const [removalLayout, setRemovalLayout] =
    useState<ClaudeAccountLayout | null>(null)
  const [privateDeletionAcknowledged, setPrivateDeletionAcknowledged] =
    useState(false)
  const [expandedConnectorsAccountId, setExpandedConnectorsAccountId] =
    useState<string | null>(null)
  const [connectors, setConnectors] =
    useState<ProviderAccountConnectors | null>(null)
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false)
  const [authorizingServerName, setAuthorizingServerName] = useState<
    string | null
  >(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setAccounts(await providerAccountApi.list())
    } catch (err) {
      setAccounts([])
      setError(describeError(err, 'Failed to load provider accounts.'))
    } finally {
      setIsLoading(false)
    }

    try {
      setHealth(await providerAccountApi.health())
    } catch {
      // A missing health report is not a reason to hide the accounts; the
      // surface simply says it has not been checked.
      setHealth(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let live = true
    let revision = 0
    const apply = (attempt: ProviderAccountLoginAttempt | null) => {
      if (!live) return
      setLoginAttempt(attempt)
      if (attempt?.state !== 'waiting-code') setLoginCode('')
      if (attempt?.active) {
        setProviderId(attempt.providerId)
        setError(null)
        setMessage(null)
      }
    }
    const unsubscribe = providerAccountApi.onLoginChanged((attempt) => {
      revision++
      apply(attempt)
      if (live && !attempt.active) void load()
    })
    const requestedAt = revision
    void providerAccountApi
      .loginAttempt()
      .then((attempt) => {
        if (requestedAt === revision) apply(attempt)
      })
      .catch(() => {
        if (live)
          setError(
            'The current sign-in could not be checked. Reopen Settings before starting another.',
          )
      })
    return () => {
      live = false
      unsubscribe()
    }
  }, [load])

  const handleCancelLogin = useCallback(async () => {
    if (!loginAttempt) return
    try {
      setLoginAttempt(await providerAccountApi.cancelLogin(loginAttempt.id))
      setLoginCode('')
    } catch {
      setError('Sign-in could not be cancelled yet. Try again.')
    }
  }, [loginAttempt])
  const handleSubmitLoginCode = useCallback(async () => {
    if (!loginAttempt) return
    const code = loginCode
    setLoginCode('')
    try {
      await providerAccountApi.submitLoginCode(loginAttempt.id, code)
    } catch {
      setError(
        'The code could not be submitted. Check the current sign-in and try again.',
      )
    }
  }, [loginAttempt, loginCode])

  const rows = useMemo(
    () =>
      buildProviderAccountSettingsRows(
        providerAccountsForProvider(accounts, providerId),
        health,
      ),
    [accounts, health, providerId],
  )

  const runForAccount = useCallback(
    async (
      accountId: string,
      action: () => Promise<void>,
      successMessage: string,
      failureMessage: string,
    ) => {
      setBusyAccountId(accountId)
      setMessage(null)
      setError(null)
      try {
        await action()
        setMessage(successMessage)
      } catch (err) {
        setError(describeError(err, failureMessage))
      } finally {
        setBusyAccountId(null)
      }
    },
    [],
  )

  const handleEnrol = useCallback(async () => {
    const email = providerId === 'claude-code' ? enrolEmail.trim() : ''
    if (providerId === 'claude-code' && !email) return

    setIsEnrolling(true)
    setMessage(null)
    setError(null)
    try {
      const result = await providerAccountApi.enrol({
        providerId,
        email,
        label: enrolLabel.trim() || null,
      })
      setEnrolEmail('')
      setEnrolLabel('')
      // Warnings are deliberately not fatal — the credential exists either way
      // — but they are the difference between a real selection and a decorative
      // one, so they are said out loud rather than logged.
      setMessage(
        result.warnings.length === 0
          ? `Enrolled ${result.account.email ?? result.account.label}.`
          : `Enrolled ${result.account.email ?? result.account.label}, but shared settings can still outrank it.`,
      )
      await load()
    } catch (err) {
      setError(describeError(err, 'Enrolment failed.'))
    } finally {
      setIsEnrolling(false)
    }
  }, [providerId, enrolEmail, enrolLabel, load])

  const handleCommitRename = useCallback(async () => {
    const accountId = renamingAccountId
    const label = renameDraft.trim()
    if (!accountId || !label) return

    await runForAccount(
      accountId,
      async () => {
        // Only the label moves. Both directory paths are hashed into the
        // keychain service name, so there is deliberately no way to edit them.
        setAccounts(await providerAccountApi.rename(accountId, label))
        setRenamingAccountId(null)
        setRenameDraft('')
      },
      'Label saved.',
      'Failed to rename the account.',
    )
  }, [renameDraft, renamingAccountId, runForAccount])

  const handleSetDefault = useCallback(
    (accountId: string) =>
      void runForAccount(
        accountId,
        async () => {
          setAccounts(await providerAccountApi.setDefault(accountId))
        },
        'Default account updated. New sessions start on it.',
        'Failed to set the default account.',
      ),
    [runForAccount],
  )

  const handleReconnect = useCallback(
    (accountId: string) =>
      void runForAccount(
        accountId,
        async () => {
          try {
            await providerAccountApi.reconnect(accountId)
          } finally {
            // Reconnect invalidates cached health on both success and refusal.
            // Reload the recorded status and drop the previous health verdict.
            await load()
          }
        },
        'Reconnected.',
        'Failed to reconnect the account.',
      ),
    [load, runForAccount],
  )

  const handleRequestRemove = useCallback(
    async (accountId: string) => {
      setBusyAccountId(accountId)
      setError(null)
      setRemovalLayout(null)
      setConfirmingRemovalAccountId(null)
      setPrivateDeletionAcknowledged(false)
      try {
        const layout =
          providerId === 'claude-code'
            ? await providerAccountApi.inspectHistory(accountId)
            : null
        if (
          providerId === 'claude-code' &&
          (!layout || layout.unreadableEntries.length)
        )
          throw new Error(
            'Account history could not be inspected. Nothing was removed. Check its files and try again.',
          )
        setRemovalLayout(layout)
        setConfirmingRemovalAccountId(accountId)
      } catch (err) {
        setError(describeError(err, 'Account history could not be inspected.'))
      } finally {
        setBusyAccountId(null)
      }
    },
    [providerId],
  )

  const handleConfirmRemove = useCallback(
    (accountId: string, deletePrivateHistory = false) => {
      if (deletePrivateHistory && !privateDeletionAcknowledged) return
      void runForAccount(
        accountId,
        async () => {
          try {
            await providerAccountApi.remove(
              accountId,
              deletePrivateHistory ? { deletePrivateHistory: true } : undefined,
            )
            setConfirmingRemovalAccountId(null)
          } finally {
            // Failed sign-out can disable the row without removing it.
            await load()
          }
        },
        'Account signed out and removed.',
        'Failed to remove the account.',
      )
    },
    [load, runForAccount, privateDeletionAcknowledged],
  )

  const handleToggleConnectors = useCallback(
    async (accountId: string) => {
      if (providerId !== 'claude-code') return
      if (expandedConnectorsAccountId === accountId) {
        setExpandedConnectorsAccountId(null)
        return
      }

      setExpandedConnectorsAccountId(accountId)
      setConnectors(null)
      setIsLoadingConnectors(true)
      try {
        setConnectors(await providerAccountApi.listConnectors(accountId))
      } catch (err) {
        setConnectors({
          providerAccountId: accountId,
          connectors: [],
          error: describeError(err, 'Failed to read connectors.'),
        })
      } finally {
        setIsLoadingConnectors(false)
      }
    },
    [providerId, expandedConnectorsAccountId],
  )

  const handleAuthorizeConnector = useCallback(
    async (accountId: string, serverName: string) => {
      if (providerId !== 'claude-code') return
      setAuthorizingServerName(serverName)
      setMessage(null)
      setError(null)
      try {
        // Returns the account's refreshed view, so the row reflects what the
        // authorization actually achieved rather than what it attempted.
        setConnectors(
          await providerAccountApi.authorizeConnector({
            accountId,
            serverName,
          }),
        )
        setMessage(`${serverName} authorized for this account.`)
      } catch (err) {
        setError(describeError(err, `Failed to authorize ${serverName}.`))
      } finally {
        setAuthorizingServerName(null)
      }
    },
    [providerId],
  )

  const handleCheckHealth = useCallback(async () => {
    setIsLoading(true)
    setMessage(null)
    setError(null)
    try {
      setHealth(await providerAccountApi.attest())
      setAccounts(await providerAccountApi.list())
    } catch (err) {
      setError(describeError(err, 'Failed to check account health.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  return (
    <ProviderAccountsFields
      providerId={providerId}
      loginAttempt={loginAttempt}
      loginCode={loginCode}
      onLoginCodeChange={setLoginCode}
      onSubmitLoginCode={() => void handleSubmitLoginCode()}
      onCancelLogin={() => void handleCancelLogin()}
      rows={rows}
      settingsWarnings={
        providerId === 'claude-code' ? (health?.settingsWarnings ?? []) : []
      }
      lastCheckedAt={health?.checkedAt ?? null}
      claudeVersion={
        providerId === 'claude-code' ? (health?.claudeVersion ?? null) : null
      }
      isLoading={isLoading}
      busyAccountId={
        busyAccountId ?? (loginAttempt?.active ? loginAttempt.accountId : null)
      }
      isEnrolling={
        isEnrolling ||
        Boolean(loginAttempt?.active && loginAttempt.kind === 'enrol')
      }
      enrolEmail={enrolEmail}
      enrolLabel={enrolLabel}
      renamingAccountId={renamingAccountId}
      renameDraft={renameDraft}
      confirmingRemovalAccountId={confirmingRemovalAccountId}
      removalLayout={removalLayout}
      privateDeletionAcknowledged={privateDeletionAcknowledged}
      onPrivateDeletionAcknowledged={setPrivateDeletionAcknowledged}
      expandedConnectorsAccountId={expandedConnectorsAccountId}
      connectors={connectors}
      isLoadingConnectors={isLoadingConnectors}
      authorizingServerName={authorizingServerName}
      message={message}
      error={error}
      onProviderChange={(nextProviderId) => {
        if (nextProviderId === providerId) return
        setProviderId(nextProviderId)
        setEnrolEmail('')
        setEnrolLabel('')
        setRenamingAccountId(null)
        setConfirmingRemovalAccountId(null)
        setExpandedConnectorsAccountId(null)
        setConnectors(null)
        setMessage(null)
        setError(null)
      }}
      onEnrolEmailChange={setEnrolEmail}
      onEnrolLabelChange={setEnrolLabel}
      onEnrol={() => void handleEnrol()}
      onStartRename={(accountId, current) => {
        setRenamingAccountId(accountId)
        setRenameDraft(current)
      }}
      onRenameDraftChange={setRenameDraft}
      onCommitRename={() => void handleCommitRename()}
      onCancelRename={() => {
        setRenamingAccountId(null)
        setRenameDraft('')
      }}
      onSetDefault={handleSetDefault}
      onReconnect={handleReconnect}
      onRequestRemove={(accountId) => void handleRequestRemove(accountId)}
      onConfirmRemove={handleConfirmRemove}
      onCancelRemove={() => {
        setConfirmingRemovalAccountId(null)
        setPrivateDeletionAcknowledged(false)
      }}
      onCheckHealth={() => void handleCheckHealth()}
      onToggleConnectors={(accountId) => void handleToggleConnectors(accountId)}
      onAuthorizeConnector={(accountId, serverName) =>
        void handleAuthorizeConnector(accountId, serverName)
      }
    />
  )
}
