import { win32 } from 'path'
import { homedir } from 'os'

const { join } = win32

export function getFallbackPathEntries(): string[] {
  const home = homedir()
  const localAppData =
    process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
  const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const programFilesX86 =
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'

  return [
    join(programFiles, 'Git', 'cmd'),
    join(programFiles, 'Git', 'bin'),
    join(programFilesX86, 'Git', 'cmd'),
    join(appData, 'npm'),
    join(localAppData, 'Programs', 'Python', 'Python312'),
    join(localAppData, 'Programs', 'Python', 'Python311'),
    join(home, '.bun', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, 'scoop', 'shims'),
    join(localAppData, 'Microsoft', 'WindowsApps'),
    join(home, 'AppData', 'Local', 'pnpm'),
  ]
}
