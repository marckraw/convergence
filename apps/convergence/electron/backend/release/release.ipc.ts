import { ipcMain } from 'electron'
import type { ReleaseActService } from './release-act.service'
import type {
  ReleaseMergeInput,
  ReleaseSeat,
} from '../../../src/shared/types/release.types'

export function registerReleaseIpcHandlers(service: ReleaseActService): void {
  ipcMain.handle('release:plan', (_event, input: ReleaseSeat) =>
    service.plan(input),
  )
  ipcMain.handle('release:merge', (_event, input: ReleaseMergeInput) =>
    service.merge(input),
  )
  ipcMain.handle('release:acts', (_event, input: ReleaseSeat) =>
    service.acts(input),
  )
}
