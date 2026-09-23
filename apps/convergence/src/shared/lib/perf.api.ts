export const perfApi = {
  isEnabled: (): boolean => window.electronAPI?.perf?.isEnabled() === true,
  report: (payload: unknown): Promise<unknown> =>
    window.electronAPI.perf.report(payload),
}
