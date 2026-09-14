/** Serializable across Electron IPC; Error subclasses lose custom fields. */
export type HandoffRefusalStage =
  | 'source-busy'
  | 'busy'
  | 'missing-thread'
  | 'not-eligible'
  | 'layout'

export interface AccountHandoffRefusal {
  accepted: false
  stage: HandoffRefusalStage
  message: string
}

export type SessionSendResult = { accepted: true } | AccountHandoffRefusal
