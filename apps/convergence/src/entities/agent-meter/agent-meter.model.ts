import { create } from 'zustand'
import type { AgentMeterSnapshot } from '@/shared/types/agent-meter.types'
import { agentMeterApi } from './agent-meter.api'

export const useAgentMeterStore = create<{ snapshot: AgentMeterSnapshot }>(
  () => ({ snapshot: { agents: null, convergence: null, rows: [] } }),
)

/** Subscribe before reading so a slower initial response cannot overwrite a broadcast. */
export function watchAgentMeter(): () => void {
  let live = true
  let updated = false
  const unsubscribe = agentMeterApi.onUpdated((snapshot) => {
    updated = true
    if (live) useAgentMeterStore.setState({ snapshot })
  })
  void agentMeterApi
    .get()
    .then((snapshot) => {
      if (live && !updated) useAgentMeterStore.setState({ snapshot })
    })
    .catch(() => {})
  return () => {
    live = false
    unsubscribe()
  }
}
