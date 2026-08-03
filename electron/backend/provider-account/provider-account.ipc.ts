import { ipcMain } from 'electron'
import type { ProviderAccountAttestationService } from './provider-account-attestation.service'
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
  repository: ProviderAccountRepository
  enrolment: ProviderAccountEnrolmentService
  attestation: ProviderAccountAttestationService
}): void {
  ipcMain.handle('providerAccounts:list', () => deps.repository.list())

  ipcMain.handle(
    'providerAccounts:enrol',
    (_event, input: EnrolProviderAccountInput) => deps.enrolment.enrol(input),
  )

  ipcMain.handle('providerAccounts:remove', (_event, accountId: string) =>
    deps.enrolment.remove(accountId),
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
}
