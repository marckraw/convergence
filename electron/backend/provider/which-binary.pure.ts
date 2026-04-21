import { getWhichCommand as darwinCommand } from './which-binary.darwin.pure'
import { getWhichCommand as win32Command } from './which-binary.win32.pure'
import { getWhichCommandFallback } from './which-binary.shared.pure'

export function resolveWhichCommand(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return darwinCommand()
  if (platform === 'win32') return win32Command()
  return getWhichCommandFallback()
}
