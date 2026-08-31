import { delimiter, join } from 'path'
import { homedir } from 'os'

const START_MARKER = '__CONVERGENCE_PATH_START__'
const END_MARKER = '__CONVERGENCE_PATH_END__'

export function buildShellPathProbeCommand(): string {
  return `printf '%s\\n%s\\n%s\\n' '${START_MARKER}' "$PATH" '${END_MARKER}'`
}

export function extractShellPathFromStdout(stdout: string): string | null {
  const start = stdout.indexOf(START_MARKER)
  const end = stdout.indexOf(END_MARKER)

  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  const value = stdout
    .slice(start + START_MARKER.length, end)
    .replace(/^\s+|\s+$/g, '')

  return value.length > 0 ? value : null
}

export function getFallbackPathEntries(): string[] {
  const home = homedir()

  return [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, 'Library', 'pnpm'),
    join(
      home,
      'Library',
      'Application Support',
      'JetBrains',
      'Toolbox',
      'scripts',
    ),
  ]
}

export function mergePathValues(
  ...values: Array<string | null | undefined>
): string {
  const entries = new Set<string>()

  for (const value of values) {
    if (!value) continue
    for (const entry of value.split(delimiter)) {
      const trimmed = entry.trim()
      if (!trimmed) continue
      entries.add(trimmed)
    }
  }

  return Array.from(entries).join(delimiter)
}
