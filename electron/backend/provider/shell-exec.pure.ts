const WINDOWS_SHELL_WRAPPED_EXTENSIONS = new Set(['.cmd', '.bat', '.ps1'])

export function getBinaryExtension(binaryPath: string): string {
  const lastSlash = Math.max(
    binaryPath.lastIndexOf('/'),
    binaryPath.lastIndexOf('\\'),
  )
  const basename = binaryPath.slice(lastSlash + 1)
  const dotIndex = basename.lastIndexOf('.')

  if (dotIndex <= 0) return ''
  return basename.slice(dotIndex).toLowerCase()
}

export function needsShellForSpawn(
  binaryPath: string,
  platform: NodeJS.Platform,
): boolean {
  return (
    platform === 'win32' &&
    WINDOWS_SHELL_WRAPPED_EXTENSIONS.has(getBinaryExtension(binaryPath))
  )
}

export function buildWindowsHiddenProcessOptions(
  binaryPath: string,
  platform: NodeJS.Platform,
): { shell: boolean; windowsHide: boolean } {
  return {
    shell: needsShellForSpawn(binaryPath, platform),
    windowsHide: platform === 'win32',
  }
}
