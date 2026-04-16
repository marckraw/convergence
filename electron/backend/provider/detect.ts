import { execFile } from 'child_process'
import type { ProviderStatusInfo } from './provider.types'
import { buildProviderStatus, getKnownProviders } from './provider-status.pure'

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

function getVersion(binaryPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(binaryPath, ['--version'], { timeout: 5_000 }, (error, stdout) => {
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
      const binaryPath = await which(provider.binaryName)
      const version = binaryPath ? await getVersion(binaryPath) : null
      return buildProviderStatus(provider, binaryPath, version)
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
