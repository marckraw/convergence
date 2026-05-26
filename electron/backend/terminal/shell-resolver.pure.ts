export const FALLBACK_SHELL = '/bin/zsh'
export const WINDOWS_FALLBACK_SHELL = 'powershell.exe'

export function resolveDefaultShell(env: NodeJS.ProcessEnv): {
  shell: string
  args: string[]
} {
  if (process.platform === 'win32') {
    const shell =
      env.CONVERGENCE_WINDOWS_SHELL ||
      env.ComSpec ||
      env.COMSPEC ||
      WINDOWS_FALLBACK_SHELL
    const args = shell.toLowerCase().endsWith('powershell.exe')
      ? ['-NoLogo']
      : []

    return { shell, args }
  }

  const fromEnv = env.SHELL
  const shell = fromEnv && fromEnv.length > 0 ? fromEnv : FALLBACK_SHELL
  return { shell, args: ['-l'] }
}
