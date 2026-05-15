import { execFile } from 'child_process'
import { existsSync, realpathSync } from 'fs'
import { delimiter } from 'path'
import type { ProviderUpdateResult } from './provider.types'
import { getKnownProviders } from './provider-status.pure'
import {
  buildNonNpmProviderInstallInfo,
  buildNpmProviderUpdateArgs,
  getProviderBinaryDirectory,
  resolveNpmManagedProviderInstall,
} from './provider-updater.pure'

function execNpmUpdate(
  npmPath: string,
  args: string[],
  envPathPrefix: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      npmPath,
      args,
      {
        timeout: 120_000,
        env: {
          ...process.env,
          PATH: [envPathPrefix, process.env.PATH]
            .filter(Boolean)
            .join(delimiter),
        },
        maxBuffer: 1024 * 1024 * 8,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              [error.message, stderr.trim()].filter(Boolean).join('\n'),
            ),
          )
          return
        }

        resolve({ stdout, stderr })
      },
    )
  })
}

function execProviderSelfUpdate(
  binaryPath: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      ['update'],
      {
        timeout: 120_000,
        env: {
          ...process.env,
          PATH: [getProviderBinaryDirectory(binaryPath), process.env.PATH]
            .filter(Boolean)
            .join(delimiter),
        },
        maxBuffer: 1024 * 1024 * 8,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              [error.message, stderr.trim()].filter(Boolean).join('\n'),
            ),
          )
          return
        }

        resolve({ stdout, stderr })
      },
    )
  })
}

export async function updateProviderPackage(
  providerId: string,
  binaryPath: string,
): Promise<ProviderUpdateResult> {
  const provider = getKnownProviders().find((item) => item.id === providerId)
  if (!provider) {
    return {
      ok: false,
      providerId,
      command: '',
      stdout: '',
      stderr: '',
      error: `Unknown provider: ${providerId}`,
    }
  }

  let realBinaryPath: string
  try {
    realBinaryPath = realpathSync(binaryPath)
  } catch (error) {
    return {
      ok: false,
      providerId,
      command: provider.updateCommand,
      stdout: '',
      stderr: '',
      error:
        error instanceof Error
          ? error.message
          : `Could not inspect provider binary at ${binaryPath}.`,
    }
  }

  const install = resolveNpmManagedProviderInstall(
    realBinaryPath,
    provider.packageName,
  )
  if (!install) {
    const nonNpmInstall = buildNonNpmProviderInstallInfo(
      realBinaryPath,
      providerId,
    )
    if (nonNpmInstall.manager === 'self' && provider.supportsSelfUpdate) {
      const command = `${binaryPath} update`
      try {
        const output = await execProviderSelfUpdate(binaryPath)
        return {
          ok: true,
          providerId,
          command,
          stdout: output.stdout,
          stderr: output.stderr,
          error: null,
        }
      } catch (error) {
        return {
          ok: false,
          providerId,
          command,
          stdout: '',
          stderr: '',
          error:
            error instanceof Error ? error.message : 'Provider update failed',
        }
      }
    }

    return {
      ok: false,
      providerId,
      command: provider.updateCommand,
      stdout: '',
      stderr: '',
      error:
        nonNpmInstall.manager === 'homebrew'
          ? `${provider.name} was found in a Homebrew-managed location. Run ${provider.updateCommand} in a terminal for now.`
          : `${provider.name} was found at ${binaryPath}, but it does not look like an npm global install for ${provider.packageName}.`,
    }
  }

  if (!existsSync(install.npmPath)) {
    return {
      ok: false,
      providerId,
      command: provider.updateCommand,
      stdout: '',
      stderr: '',
      error: `Could not find npm for the detected install at ${install.npmPath}.`,
    }
  }

  const args = buildNpmProviderUpdateArgs(provider.packageName)
  const command = [install.npmPath, ...args].join(' ')

  try {
    const output = await execNpmUpdate(
      install.npmPath,
      args,
      getProviderBinaryDirectory(binaryPath),
    )
    return {
      ok: true,
      providerId,
      command,
      stdout: output.stdout,
      stderr: output.stderr,
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      providerId,
      command,
      stdout: '',
      stderr: '',
      error: error instanceof Error ? error.message : 'Provider update failed',
    }
  }
}
