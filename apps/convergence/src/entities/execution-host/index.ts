export {
  DEFAULT_EXECUTION_HOST_ENDPOINT_ID,
  executionHostEndpointDisplayName,
  isLocalExecutionHost,
  isRemoteExecutionHost,
  LOCAL_EXECUTION_HOST_ID,
  UNNAMED_EXECUTION_HOST_ENDPOINT_LABEL,
} from './execution-host.pure'
export type {
  ExecutionHostEndpoint,
  ExecutionHostEndpointInput,
} from './execution-host.types'

export { WorkAddressSlot } from './work-address-slot.presentational'
export {
  resolveWorkAddressSlot,
  branchNameFromDraft,
  workAddressForNewSession,
  workAddressReadyForSend,
  REPOSITORY_WORK_ADDRESS_CHOICE_ID,
} from './work-address-slot.pure'
export type {
  WorkAddressSlotInput,
  WorkAddressSlotView,
  LocalRepositoryState,
  WorkAddressProject,
  WorkAddressProjects,
} from './work-address-slot.pure'
