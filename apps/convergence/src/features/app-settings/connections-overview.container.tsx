import type { FC } from 'react'
import {
  describeProviderAccountIdentity,
  providerAccountApi,
  type ProviderAccount,
  type ProviderAccountChatGptSignIns,
} from '@/entities/provider-account'
import {
  claudeConnectionPaths,
  codexConnectionPaths,
  type ConnectionPath,
} from './connections-overview.pure'
import {
  useConnectionsOverviewStore,
  type ConnectionsOverviewRow,
} from './connections-overview.model'
import { useChatGptSignInsStore } from './chatgpt-sign-ins.model'
import { ConnectionsOverview } from './connections-overview.presentational'

function describeError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The check failed.'
}

/** Reads one OpenAI account's paths; its sign-in check also feeds the panel. */
async function readCodexPaths(
  accountId: string,
): Promise<{ paths: ConnectionPath[]; error: string | null }> {
  const [apps, connectors] = await Promise.all([
    providerAccountApi.listChatGptApps({ accountId, forceRefetch: false }),
    providerAccountApi.listConnectors(accountId),
  ])
  // Begun here, settled always: a check left in flight would stop the
  // account's own Connectors panel from ever checking by itself.
  const signInsStore = useChatGptSignInsStore.getState()
  const check = signInsStore.begin(accountId)
  let signIns: ProviderAccountChatGptSignIns
  try {
    signIns = await providerAccountApi.checkChatGptAppSignIns({ accountId })
  } catch {
    signIns = {
      providerAccountId: accountId,
      checkedAt: null,
      signIns: [],
      servers: [],
      error: 'Could not check sign-ins. Try Refresh.',
    }
  }
  signInsStore.settle(accountId, check, signIns)
  return {
    paths: codexConnectionPaths({
      apps: apps.apps,
      signIns,
      connectors: connectors.connectors,
    }),
    error: apps.error ?? connectors.error ?? signIns.error,
  }
}

async function readClaudePaths(
  accountId: string,
): Promise<{ paths: ConnectionPath[]; error: string | null }> {
  const connectors = await providerAccountApi.listConnectors(accountId)
  return {
    paths: claudeConnectionPaths(connectors.connectors),
    error: connectors.error,
  }
}

function initialRow(account: ProviderAccount): ConnectionsOverviewRow {
  return {
    accountId: account.id,
    provider: account.providerId === 'codex' ? 'OpenAI' : 'Claude',
    identity: describeProviderAccountIdentity(account),
    state: account.status === 'connected' ? 'checking' : 'not-connected',
    paths: [],
    error: null,
  }
}

/**
 * "Check all accounts" (MAR-3518): every OpenAI and Claude account on this
 * Mac, one at a time, through the checks the Connectors panel already runs.
 * On demand only — a check starts each account's server and calls each app.
 */
export const ConnectionsOverviewContainer: FC = () => {
  const rows = useConnectionsOverviewStore((state) => state.rows)
  const checkedAt = useConnectionsOverviewStore((state) => state.checkedAt)
  const running = useConnectionsOverviewStore((state) => state.running)

  const checkAll = async () => {
    const store = useConnectionsOverviewStore.getState()
    let accounts: ProviderAccount[]
    try {
      accounts = (await providerAccountApi.list()).filter(
        (account) =>
          (account.providerId === 'codex' ||
            account.providerId === 'claude-code') &&
          account.executionHostId === 'local',
      )
    } catch {
      accounts = []
    }
    const run = store.begin(accounts.map(initialRow))
    for (const account of accounts) {
      const row = initialRow(account)
      if (row.state === 'not-connected') continue
      try {
        const read =
          account.providerId === 'codex'
            ? await readCodexPaths(account.id)
            : await readClaudePaths(account.id)
        store.update(run, {
          ...row,
          state: 'checked',
          paths: read.paths,
          error: read.error,
        })
      } catch (error) {
        store.update(run, {
          ...row,
          state: 'failed',
          error: describeError(error),
        })
      }
    }
    store.finish(run, new Date().toISOString())
  }

  return (
    <ConnectionsOverview
      rows={rows}
      checkedAt={checkedAt}
      isChecking={running !== null}
      onCheckAll={() => void checkAll()}
    />
  )
}
