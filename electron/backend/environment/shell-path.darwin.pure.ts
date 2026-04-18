import { posix } from 'path'
import { homedir } from 'os'

const { join } = posix

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
