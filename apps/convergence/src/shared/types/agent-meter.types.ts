export interface MeterUsage {
  cpu: number
  memoryMb: number
}

export interface AgentMeterRow {
  sessionId: string
  account: string | null
  usage: MeterUsage | null
}

export interface AgentMeterSnapshot {
  agents: MeterUsage | null
  convergence: MeterUsage | null
  rows: AgentMeterRow[]
}
