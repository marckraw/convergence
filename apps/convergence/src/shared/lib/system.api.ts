interface SystemInfo {
  platform: string
  prefersReducedTransparency: boolean
}

export const systemApi = {
  getInfo: (): SystemInfo | null =>
    window.electronAPI.system?.getInfo?.() ?? null,
}
