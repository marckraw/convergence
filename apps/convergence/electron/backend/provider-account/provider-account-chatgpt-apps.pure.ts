/** Non-secret projections of Codex 0.157's app protocol. */
export interface ChatGptAppInfo {
  id: string
  name: string
  installUrl: string | null
  isAccessible: boolean
  isEnabled: boolean
}

export interface InstalledChatGptApp {
  id: string
  runtimeName: string | null
  enabled: boolean
  callable: boolean
}

export type ChatGptAppState = 'available' | 'unavailable' | 'off'

export interface ProviderAccountChatGptApps {
  providerAccountId: string
  apps: Array<{ id: string; name: string; state: ChatGptAppState }>
  requiresChatGpt: boolean
  error: string | null
}

/** Availability is policy/tool visibility, never an authorization-health probe. */
export function chatGptAppState(
  appInfo: ChatGptAppInfo | undefined,
  installed: InstalledChatGptApp | undefined,
): ChatGptAppState {
  if (appInfo?.isEnabled === false || installed?.enabled === false) return 'off'
  return installed?.callable === true ? 'available' : 'unavailable'
}

export function selectChatGptApps(
  directory: ChatGptAppInfo[],
  installed: InstalledChatGptApp[],
): ProviderAccountChatGptApps['apps'] {
  const runtime = new Map(installed.map((app) => [app.id, app]))
  const metadata = new Map(directory.map((app) => [app.id, app]))
  const ids = new Set([
    ...installed.map((app) => app.id),
    ...directory.filter((app) => app.isAccessible).map((app) => app.id),
  ])
  return [...ids]
    .map((id) => ({
      id,
      name: metadata.get(id)?.name || runtime.get(id)?.runtimeName || id,
      state: chatGptAppState(metadata.get(id), runtime.get(id)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}
