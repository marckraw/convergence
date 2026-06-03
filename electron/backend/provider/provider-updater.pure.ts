import { dirname, join, posix, win32 } from 'path'
import type { ProviderInstallInfo } from './provider.types'

export interface NpmManagedProviderInstall {
  packageName: string
  packageDirectory: string
  prefixDirectory: string
  npmPath: string
}

export function resolveNpmManagedProviderInstall(
  realBinaryPath: string,
  packageName: string,
  platform: NodeJS.Platform = process.platform,
): NpmManagedProviderInstall | null {
  const pathSeparator = platform === 'win32' ? win32.sep : posix.sep
  const packagePathParts = packageName.split('/')
  const pathParts = realBinaryPath.split(pathSeparator)
  const nodeModulesIndex = pathParts.lastIndexOf('node_modules')

  if (nodeModulesIndex <= 0) return null

  const packageDirectoryParts = pathParts.slice(
    nodeModulesIndex + 1,
    nodeModulesIndex + 1 + packagePathParts.length,
  )
  if (packageDirectoryParts.join('/') !== packageName) return null

  const prefixEndIndex =
    pathParts[nodeModulesIndex - 1] === 'lib'
      ? nodeModulesIndex - 1
      : nodeModulesIndex
  const prefixDirectory = pathParts.slice(0, prefixEndIndex).join(pathSeparator)
  if (!prefixDirectory) return null

  const packageDirectory = pathParts
    .slice(0, nodeModulesIndex + 1 + packagePathParts.length)
    .join(pathSeparator)
  const npmPath =
    platform === 'win32'
      ? win32.join(prefixDirectory, 'npm.cmd')
      : join(prefixDirectory, 'bin', 'npm')

  return {
    packageName,
    packageDirectory,
    prefixDirectory,
    npmPath,
  }
}

export function buildNpmProviderInstallInfo(input: {
  realBinaryPath: string
  packageName: string
  packageDirectory: string
  prefixDirectory: string
  npmPath: string
  nodePath: string | null
  nodeVersion: string | null
}): ProviderInstallInfo {
  return {
    manager: 'npm',
    realBinaryPath: input.realBinaryPath,
    packageName: input.packageName,
    packageDirectory: input.packageDirectory,
    prefixDirectory: input.prefixDirectory,
    npmPath: input.npmPath,
    nodePath: input.nodePath,
    nodeVersion: input.nodeVersion,
    brewPrefix: null,
    formulaName: null,
  }
}

export function buildNonNpmProviderInstallInfo(
  realBinaryPath: string,
  providerId: string,
): ProviderInstallInfo {
  const homebrew = resolveHomebrewProviderInstall(realBinaryPath)

  if (homebrew) {
    return {
      manager: 'homebrew',
      realBinaryPath,
      packageName: null,
      packageDirectory: null,
      prefixDirectory: homebrew.prefixDirectory,
      npmPath: null,
      nodePath: null,
      nodeVersion: null,
      brewPrefix: homebrew.prefixDirectory,
      formulaName: homebrew.formulaName,
    }
  }

  return {
    manager:
      providerId === 'claude-code' || providerId === 'antigravity'
        ? 'self'
        : 'unknown',
    realBinaryPath,
    packageName: null,
    packageDirectory: null,
    prefixDirectory: null,
    npmPath: null,
    nodePath: null,
    nodeVersion: null,
    brewPrefix: null,
    formulaName: null,
  }
}

export function resolveHomebrewProviderInstall(
  realBinaryPath: string,
  platform: NodeJS.Platform = process.platform,
): { prefixDirectory: string; formulaName: string | null } | null {
  if (platform !== 'darwin') return null

  const normalized = realBinaryPath.split(posix.sep).join(posix.sep)
  const match = normalized.match(
    /^(\/(?:opt\/homebrew|usr\/local))\/Cellar\/([^/]+)\//,
  )
  if (match) {
    return {
      prefixDirectory: match[1]!,
      formulaName: match[2]!,
    }
  }

  if (
    normalized.startsWith('/opt/homebrew/') ||
    normalized.startsWith('/usr/local/')
  ) {
    const prefixDirectory = normalized.startsWith('/opt/homebrew/')
      ? '/opt/homebrew'
      : '/usr/local'
    return {
      prefixDirectory,
      formulaName: null,
    }
  }

  return null
}

export function buildNpmProviderUpdateArgs(packageName: string): string[] {
  return ['install', '-g', `${packageName}@latest`]
}

export function getProviderBinaryDirectory(binaryPath: string): string {
  return dirname(binaryPath)
}
