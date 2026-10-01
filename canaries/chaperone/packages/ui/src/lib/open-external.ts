// canary: ui-package-imports-no-app
// A design-system helper that imports Electron itself.
import { shell } from 'electron'

export const openExternal = (url: string) => shell.openExternal(url)
