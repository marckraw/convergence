import type { AgentMeterSnapshot } from '@/shared/types/agent-meter.types'

export const agentMeterApi = {
  get: (): Promise<AgentMeterSnapshot> =>
    window.electronAPI?.agentMeter?.get() ??
    Promise.resolve({ agents: null, convergence: null, rows: [] }),
  onUpdated: (callback: (snapshot: AgentMeterSnapshot) => void): (() => void) =>
    window.electronAPI?.agentMeter?.onUpdated(callback) ?? (() => undefined),
}
