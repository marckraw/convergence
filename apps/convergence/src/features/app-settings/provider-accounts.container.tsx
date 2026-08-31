import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import {
  buildProviderAccountSettingsRows,
  providerAccountApi,
  type ProviderAccount,
  type ProviderAccountConnectors,
  type ProviderAccountHealth,
} from '@/entities/provider-account'
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

  const rows = useMemo(
    () => buildProviderAccountSettingsRows(accounts, health),
    [accounts, health],
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
    const email = enrolEmail.trim()
    if (!email) return

    setIsEnrolling(true)
    setMessage(null)
    setError(null)
    try {
      const result = await providerAccountApi.enrol({
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
  }, [enrolEmail, enrolLabel, load])

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
          const account = await providerAccountApi.reconnect(accountId)
          setAccounts((current) =>
            current.map((candidate) =>
              candidate.id === account.id ? account : candidate,
            ),
          )
        },
        'Reconnected.',
        'Failed to reconnect the account.',
      ),
    [runForAccount],
  )

  const handleConfirmRemove = useCallback(
    (accountId: string) =>
      void runForAccount(
        accountId,
        async () => {
          await providerAccountApi.remove(accountId)
          setConfirmingRemovalAccountId(null)
          await load()
        },
        'Account signed out and removed.',
        'Failed to remove the account.',
      ),
    [load, runForAccount],
  )

  const handleToggleConnectors = useCallback(
    async (accountId: string) => {
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
    [expandedConnectorsAccountId],
  )

  const handleAuthorizeConnector = useCallback(
    async (accountId: string, serverName: string) => {
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
    [],
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
      rows={rows}
      settingsWarnings={health?.settingsWarnings ?? []}
      lastCheckedAt={health?.checkedAt ?? null}
      claudeVersion={health?.claudeVersion ?? null}
      isLoading={isLoading}
      busyAccountId={busyAccountId}
      isEnrolling={isEnrolling}
      enrolEmail={enrolEmail}
      enrolLabel={enrolLabel}
      renamingAccountId={renamingAccountId}
      renameDraft={renameDraft}
      confirmingRemovalAccountId={confirmingRemovalAccountId}
      expandedConnectorsAccountId={expandedConnectorsAccountId}
      connectors={connectors}
      isLoadingConnectors={isLoadingConnectors}
      authorizingServerName={authorizingServerName}
      message={message}
      error={error}
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
      onRequestRemove={setConfirmingRemovalAccountId}
      onConfirmRemove={handleConfirmRemove}
      onCancelRemove={() => setConfirmingRemovalAccountId(null)}
      onCheckHealth={() => void handleCheckHealth()}
      onToggleConnectors={(accountId) => void handleToggleConnectors(accountId)}
      onAuthorizeConnector={(accountId, serverName) =>
        void handleAuthorizeConnector(accountId, serverName)
      }
    />
  )
}
