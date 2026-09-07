import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  mergeEnv,
  parseDotEnv,
  readStudioConfig,
  type StudioConfigReading,
} from './studio-config.pure'

/** Main-process configuration door. Shell values win; values never enter IPC. */
export async function loadStudioConfig(): Promise<StudioConfigReading> {
  for (const candidate of [
    join(app.getAppPath(), '.env'),
    join(process.cwd(), '.env'),
  ]) {
    try {
      return readStudioConfig(
        mergeEnv(process.env, parseDotEnv(await readFile(candidate, 'utf8'))),
      )
    } catch {
      continue
    }
  }
  return readStudioConfig(process.env)
}
