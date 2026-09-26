import type { ProviderAccountLoginService } from './provider-account-login.service'
import { ipcMain, shell } from 'electron'
import type { ProviderAccountAttestationService } from './provider-account-attestation.service'
import type { ProviderAccountMcpService } from './provider-account-mcp.service'
import type {
  EnrolProviderAccountInput,
  ProviderAccountEnrolmentService,
} from './provider-account-enrolment.service'
import type { ProviderAccountRepository } from './provider-account.repository'

/**
 * The minimal enrolment trigger (PA3). PA6 replaces it with a real settings
 * surface; until then this is the whole user interface, deliberately thin so
 * the polished version is not shaped by a throwaway.
 */
export function registerProviderAccountIpcHandlers(deps: {
  login: ProviderAccountLoginService
  repository: ProviderAccountRepository
  enrolment: ProviderAccountEnrolmentService
  attestation: ProviderAccountAttestationService
  mcp: ProviderAccountMcpService
}): void {
  ipcMain.handle('providerAccounts:list', () => deps.repository.list())

  ipcMain.handle(
    'providerAccounts:enrol',
    (_event, input: EnrolProviderAccountInput) => {
      const providerId = input.providerId ?? 'claude-code'
      if (providerId !== 'claude-code' && providerId !== 'codex')
        throw new Error('This provider does not support account sign-in.')
      return deps.login.run(
        { providerId, accountId: null, kind: 'enrol' },
        () => deps.enrolment.enrol(input),
      )
    },
  )

  ipcMain.handle('providerAccounts:reconnect', (_event, accountId: string) => {
    const account = deps.repository.get(accountId)
    if (
      !account ||
      (account.providerId !== 'claude-code' && account.providerId !== 'codex')
    )
      throw new Error('This account is not available for sign-in.')
    return deps.login.run(
      { providerId: account.providerId, accountId, kind: 'reconnect' },
      () => deps.enrolment.reconnect(accountId),
    )
  })
  ipcMain.handle('providerAccounts:loginAttempt', () => deps.login.getAttempt())
  ipcMain.handle('providerAccounts:cancelLogin', (_event, id: string) =>
    deps.login.cancel(id),
  )
  ipcMain.handle(
    'providerAccounts:submitLoginCode',
    (_event, id: string, code: unknown) => deps.login.submitCode(id, code),
  )

  ipcMain.handle(
    'providerAccounts:remove',
    (_event, accountId: string, options?: { deletePrivateHistory?: boolean }) =>
      deps.enrolment.remove(accountId, options),
  )

  ipcMain.handle(
    'providerAccounts:inspectHistory',
    (_event, accountId: string) => deps.enrolment.inspectHistory(accountId),
  )

  ipcMain.handle('providerAccounts:setDefault', (_event, accountId: string) => {
    deps.repository.setDefault(accountId)
    return deps.repository.list()
  })

  ipcMain.handle(
    'providerAccounts:rename',
    (_event, accountId: string, label: string) => {
      deps.repository.rename(accountId, label)
      return deps.repository.list()
    },
  )

  ipcMain.handle('providerAccounts:sweepOrphans', () =>
    deps.enrolment.sweepOrphanCredentialNamespaces(),
  )

  ipcMain.handle('providerAccounts:scanSharedSettings', () =>
    deps.enrolment.scanSharedSettings(),
  )

  ipcMain.handle('providerAccounts:attest', () => deps.attestation.attestAll())

  ipcMain.handle('providerAccounts:health', () => deps.attestation.getHealth())

  ipcMain.handle(
    'providerAccounts:listChatGptApps',
    (_event, input: { accountId: string; forceRefetch?: boolean }) =>
      deps.mcp.listChatGptApps(input.accountId, input.forceRefetch === true),
  )
  ipcMain.handle(
    'providerAccounts:manageChatGptApp',
    async (_event, input: { accountId: string; appId: string }) => {
      const url = await deps.mcp.chatGptAppUrl(input.accountId, input.appId)
      await shell.openExternal(url)
    },
  )
  ipcMain.handle('providerAccounts:browseChatGptApps', () =>
    shell.openExternal('https://chatgpt.com/apps'),
  )

  ipcMain.handle(
    'providerAccounts:listConnectors',
    (_event, accountId: string | null) => deps.mcp.listConnectors(accountId),
  )

  ipcMain.handle(
    'providerAccounts:connectLinear',
    async (_event, accountId: string) => {
      try {
        await deps.mcp.connectLinear(accountId)
        return deps.mcp.listConnectors(accountId)
      } catch (error) {
        const current = await deps.mcp.listConnectors(accountId)
        return {
          ...current,
          error:
            current.error ??
            (error instanceof Error
              ? error.message
              : 'Failed to connect Linear.'),
        }
      }
    },
  )

  ipcMain.handle(
    'providerAccounts:authorizeConnector',
    async (_event, input: { accountId: string | null; serverName: string }) => {
      try {
        await deps.mcp.authorizeConnector(input)
      } catch (error) {
        // Return Codex's refusal as data so Electron does not prefix its sentence.
        if (
          input.accountId &&
          deps.repository.get(input.accountId)?.providerId === 'codex'
        ) {
          const current = await deps.mcp.listConnectors(input.accountId)
          return {
            ...current,
            error:
              current.error ??
              (error instanceof Error
                ? error.message
                : 'Failed to authorize connector.'),
          }
        }
        throw error
      }
      return deps.mcp.listConnectors(input.accountId)
    },
  )
}
