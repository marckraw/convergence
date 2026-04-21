import { execFile } from 'child_process'
import type { ProviderStatusInfo } from './provider.types'
import { buildProviderStatus, getKnownProviders } from './provider-status.pure'
import { isPiAuthConfigured } from './pi/pi-auth-status'
import { resolveWhichCommand } from './which-binary.pure'
import { needsShellForSpawn } from './shell-exec.pure'

function which(binary: string): Promise<string | null> {
  const cmd = resolveWhichCommand(process.platform)
  return new Promise((resolve) => {
    execFile(cmd, [binary], { shell: false }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null)
      } else {
        resolve(stdout.trim().split('\n')[0])
      }
    })
  })
}

function getVersion(binaryPath: string): Promise<string | null> {
  const shell = needsShellForSpawn(binaryPath, process.platform)
  return new Promise((resolve) => {
    execFile(
      binaryPath,
      ['--version'],
      { timeout: 5_000, shell },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null)
        } else {
          resolve(stdout.trim().split('\n')[0])
        }
      },
    )
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
      const status = buildProviderStatus(provider, binaryPath, version)
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
