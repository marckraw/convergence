export const FALLBACK_SHELL = '/bin/zsh'

export function resolveDefaultShell(env: NodeJS.ProcessEnv): {
  shell: string
  args: string[]
} {
  const fromEnv = env.SHELL
  const shell = fromEnv && fromEnv.length > 0 ? fromEnv : FALLBACK_SHELL
  return { shell, args: ['-l'] }
}
