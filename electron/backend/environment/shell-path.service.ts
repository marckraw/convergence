import { hydrateProcessPath as hydrateDarwin } from './shell-path.darwin'
import { hydrateProcessPath as hydrateWin32 } from './shell-path.win32'

export async function hydrateProcessPathFromShell(): Promise<void> {
  if (process.platform === 'darwin') {
    return hydrateDarwin()
  }

  if (process.platform === 'win32') {
    return hydrateWin32()
  }
}
