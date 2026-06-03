import { execFile } from 'child_process'
import { join } from 'path'
import { realpathSync } from 'fs'
import type { ProviderInstallInfo, ProviderStatusInfo } from './provider.types'
import {
  buildProviderStatus,
  getKnownProviders,
  selectProviderVersionOutput,
  type KnownProvider,
} from './provider-status.pure'
import { fetchNpmLatestVersion } from './npm-registry'
import { fetchGithubLatestReleaseVersion } from './github-release'
import { isPiAuthConfigured } from './pi/pi-auth-status'
import {
  buildNonNpmProviderInstallInfo,
  buildNpmProviderInstallInfo,
  resolveNpmManagedProviderInstall,
} from './provider-updater.pure'

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
    execFile(
      binaryPath,
      ['--version'],
      { timeout: 5_000 },
      (_error, stdout, stderr) => {
        const versionOutput = selectProviderVersionOutput(stdout, stderr)
        if (!versionOutput) {
          resolve(null)
        } else {
          resolve(versionOutput)
        }
      },
    )
  })
}

function getNodeVersion(nodePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      nodePath,
      ['--version'],
      { timeout: 5_000 },
      (_error, stdout, stderr) => {
        const versionOutput = selectProviderVersionOutput(stdout, stderr)
        if (!versionOutput) {
          resolve(null)
        } else {
          resolve(versionOutput)
        }
      },
    )
  })
}

async function inspectNpmInstall(
  binaryPath: string,
  provider: KnownProvider,
  providerId: string,
): Promise<ProviderInstallInfo | null> {
  try {
    const realBinaryPath = realpathSync(binaryPath)
    const packageNames = [
      provider.packageName,
      ...(provider.legacyPackageNames ?? []),
    ].filter((packageName): packageName is string => !!packageName)
    if (packageNames.length === 0) {
      return buildNonNpmProviderInstallInfo(realBinaryPath, providerId)
    }

    const install =
      packageNames
        .map((packageName) =>
          resolveNpmManagedProviderInstall(realBinaryPath, packageName),
        )
        .find((item) => item !== null) ?? null
    if (!install) {
      return buildNonNpmProviderInstallInfo(realBinaryPath, providerId)
    }

    const nodePath = join(
      install.prefixDirectory,
      'bin',
      process.platform === 'win32' ? 'node.exe' : 'node',
    )
    const nodeVersion = await getNodeVersion(nodePath)

    return buildNpmProviderInstallInfo({
      realBinaryPath,
      packageName: install.packageName,
      packageDirectory: install.packageDirectory,
      prefixDirectory: install.prefixDirectory,
      npmPath: install.npmPath,
      nodePath,
      nodeVersion,
    })
  } catch {
    return null
  }
}

async function findProviderBinary(
  provider: KnownProvider,
): Promise<string | null> {
  for (const binaryName of [
    provider.binaryName,
    ...(provider.binaryAliases ?? []),
  ]) {
    const binaryPath = await which(binaryName)
    if (binaryPath) return binaryPath
  }

  return null
}

function fetchLatestProviderVersion(provider: KnownProvider) {
  if (provider.latestVersionSource?.type === 'github-release') {
    return fetchGithubLatestReleaseVersion(provider.latestVersionSource)
  }

  if (provider.packageName) {
    return fetchNpmLatestVersion(provider.packageName)
  }

  return Promise.resolve({ version: null, error: null })
}

export interface DetectedProvider {
  id: string
  name: string
  binaryPath: string
  version?: string | null
}

export async function inspectProviderStatuses(): Promise<ProviderStatusInfo[]> {
  const statuses = await Promise.all(
    getKnownProviders().map(async (provider) => {
      const binaryPath = await findProviderBinary(provider)
      const [
        { version: latestVersion, error: updateCheckError },
        version,
        install,
      ] = await Promise.all([
        fetchLatestProviderVersion(provider),
        binaryPath ? getVersion(binaryPath) : Promise.resolve(null),
        binaryPath
          ? inspectNpmInstall(binaryPath, provider, provider.id)
          : Promise.resolve(null),
      ])
      const status = buildProviderStatus(
        provider,
        binaryPath,
        version,
        latestVersion,
        updateCheckError,
        install,
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
            version: provider.version,
          },
        ]
      : [],
  )
}
