import { dirname, join, posix, win32 } from 'path'

export interface NpmManagedProviderInstall {
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
    packageDirectory,
    prefixDirectory,
    npmPath,
  }
}

export function buildNpmProviderUpdateArgs(packageName: string): string[] {
  return ['install', '-g', `${packageName}@latest`]
}

export function getProviderBinaryDirectory(binaryPath: string): string {
  return dirname(binaryPath)
}
