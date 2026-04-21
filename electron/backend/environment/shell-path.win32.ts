import { delimiter } from 'path'
import { mergePathValues } from './shell-path.shared.pure'
import { getFallbackPathEntries } from './shell-path.win32.pure'

export async function hydrateProcessPath(): Promise<void> {
  const fallbackPath = getFallbackPathEntries().join(delimiter)

  process.env.PATH = mergePathValues(process.env.PATH, fallbackPath)
}
