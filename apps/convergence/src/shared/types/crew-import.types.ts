export type CrewImportState =
  | 'bound'
  | 'differs'
  | 'create'
  | 'choose'
  | 'missing-project'
  | 'missing-lane'
  | 'missing-endpoint'
  | 'remote-create-unsupported'
  | 'existing'
  | 'new'
  | 'kept'
export interface CrewImportRow {
  key: string
  label: string
  state: CrewImportState
  detail: string
  differences: string[]
  canUpdate: boolean
  warnings?: {
    updateKey: string
    takeoverUpdateKey?: string
    message: string
  }[]
  choiceKey?: string
  options: { value: string; label: string }[]
}
export interface CrewImportRoleRow extends CrewImportRow {
  role: string
  sessionId: string | null
  projectId: string | null
}
export interface CrewImportWireRow extends CrewImportRow {
  index: number
  relayId: string | null
  spawnProjectId: string | null
}
export interface CrewImportPlan {
  path: string
  revision: string
  crew: CrewImportRow & { id: string | null }
  roles: CrewImportRoleRow[]
  wires: CrewImportWireRow[]
  limits: CrewImportRow
  kept: CrewImportRow[]
  hasLayout: boolean
  canApply: boolean
}
export interface CrewImportDecisions {
  revision: string
  choices: Record<string, string>
  updates: Record<string, boolean>
  includeLayout: boolean
}
export interface CrewImportReport {
  path: string
  crewId: string
  entries: {
    key: string
    label: string
    outcome:
      | 'created'
      | 'bound'
      | 'updated'
      | 'not updated'
      | 'baton updated; model not updated'
      | 'kept'
    reason?: string
  }[]
  nothingToChange: boolean
}
