import { execFile } from 'child_process'
import { existsSync, realpathSync } from 'fs'
import { delimiter, join } from 'path'
import type { ProviderUpdateResult } from './provider.types'
import { getKnownProviders } from './provider-status.pure'
import {
  buildBinaryPathCandidates,
  buildNonNpmProviderInstallInfo,
  buildNpmProviderUninstallArgs,
  buildNpmProviderUpdateArgs,
  getProviderBinaryDirectory,
  resolveNpmManagedProviderInstall,
} from './provider-updater.pure'

/**
 * Resolves a runnable `npm` binary for an npm-managed provider install.
 *
 * npm is not always co-located with the provider's global package prefix: when
 * a user sets a custom npm prefix (e.g. `npm config set prefix ~/.npm-global`),
 * global packages land in that prefix while `npm`/`node` stay with the Node
 * install. We therefore prefer the prefix-local `npm`, then fall back to the
 * first `npm` on the (shell-hydrated) PATH.
 */
function resolveNpmBinaryPath(
  preferredNpmPath: string,
  prefixDirectory: string,
  providerBinaryDirectory: string,
): string | null {
  if (existsSync(preferredNpmPath)) {
    return preferredNpmPath
  }

  const searchPath = [
    providerBinaryDirectory,
    join(prefixDirectory, 'bin'),
    process.env.PATH,
  ]
    .filter(Boolean)
    .join(delimiter)

  for (const candidate of buildBinaryPathCandidates('npm', searchPath)) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

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

  const providerPackageNames = [
    provider.packageName,
    ...(provider.legacyPackageNames ?? []),
  ].filter((packageName): packageName is string => !!packageName)
  const install =
    providerPackageNames
      .map((packageName) =>
        resolveNpmManagedProviderInstall(realBinaryPath, packageName),
      )
      .find((item) => item !== null) ?? null
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
          : providerPackageNames.length > 0
            ? `${provider.name} was found at ${binaryPath}, but it does not look like an npm global install for ${providerPackageNames.join(' or ')}.`
            : `${provider.name} was found at ${binaryPath}, but Convergence does not know how to update this install automatically.`,
    }
  }

  if (!provider.packageName) {
    return {
      ok: false,
      providerId,
      command: provider.updateCommand,
      stdout: '',
      stderr: '',
      error: `${provider.name} does not have an npm package configured for updates.`,
    }
  }

  const npmBinaryPath = resolveNpmBinaryPath(
    install.npmPath,
    install.prefixDirectory,
    getProviderBinaryDirectory(binaryPath),
  )
  if (!npmBinaryPath) {
    return {
      ok: false,
      providerId,
      command: provider.updateCommand,
      stdout: '',
      stderr: '',
      error: `Could not find npm to update ${provider.name}. Convergence looked for npm at ${install.npmPath} and on your PATH. Install Node (which bundles npm) and make sure it is on your PATH, then try again.`,
    }
  }

  // Always target the prefix that owns the existing install so the update lands
  // where the binary already lives, even when the resolved npm's default prefix
  // differs (custom npm prefix setups).
  const args = buildNpmProviderUpdateArgs(
    provider.packageName,
    install.prefixDirectory,
  )
  const isLegacyInstall =
    install.packageName !== provider.packageName &&
    provider.legacyPackageNames?.includes(install.packageName) === true
  const uninstallLegacyArgs = buildNpmProviderUninstallArgs(
    install.packageName,
    install.prefixDirectory,
  )
  const npmPathPrefix = [
    getProviderBinaryDirectory(npmBinaryPath),
    getProviderBinaryDirectory(binaryPath),
  ].join(delimiter)
  const command = isLegacyInstall
    ? [
        [npmBinaryPath, ...uninstallLegacyArgs].join(' '),
        [npmBinaryPath, ...args].join(' '),
      ].join(' && ')
    : [npmBinaryPath, ...args].join(' ')

  try {
    if (isLegacyInstall) {
      await execNpmUpdate(npmBinaryPath, uninstallLegacyArgs, npmPathPrefix)
    }
    const output = await execNpmUpdate(npmBinaryPath, args, npmPathPrefix)
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
