import { execFile } from 'child_process'
import type { ProviderStatusInfo } from './provider.types'
import { buildProviderStatus, getKnownProviders } from './provider-status.pure'
import { isPiAuthConfigured } from './pi/pi-auth-status'

function which(binary: string): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  return new Promise((resolve) => {
    execFile(cmd, [binary], (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null)
      } else {
        resolve(stdout.trim().split('\n')[0])
      }
    })
  })
}

export interface DetectedProvider {
  id: string
  name: string
  binaryPath: string
}

export async function inspectProviderStatuses(): Promise<ProviderStatusInfo[]> {
  const statuses = await Promise.all(
    getKnownProviders().map(async (provider) => {
      const status = buildProviderStatus(
        provider,
        await which(provider.binaryName),
      )
      if (
        provider.id === 'pi' &&
        status.availability === 'available' &&
        !isPiAuthConfigured()
      ) {
        return {
          ...status,
          statusLabel: 'Needs login',
          reason: 'Run `pi /login` in your terminal.',
        }
      }
      return status
    }),
  )

  return statuses
}

export async function detectProviders(): Promise<DetectedProvider[]> {
  const statuses = await inspectProviderStatuses()

  return statuses.flatMap((provider) =>
    provider.binaryPath
      ? [
          {
            id: provider.id,
            name: provider.name,
            binaryPath: provider.binaryPath,
          },
        ]
      : [],
  )
}
