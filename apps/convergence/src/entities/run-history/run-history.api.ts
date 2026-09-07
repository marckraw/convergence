import type { ListRunsOptions, RelayRunPage } from './run-history.types'

export const runHistoryApi = {
  /**
   * One page of this crew's runs, newest first.
   *
   * A read, and only a read: reloading history never retries a delivery
   * (promise 7). Nothing on this surface sends.
   */
  listRuns: (
    crewId: string,
    options?: ListRunsOptions,
  ): Promise<RelayRunPage> =>
    window.electronAPI.relay.listRuns(crewId, options),
}
