import type {
  StartWorkboardRunInput,
  UpsertWorkboardProjectMappingInput,
  UpsertWorkboardTrackerSourceInput,
  WorkboardProjectMappingRecord,
  WorkboardSnapshot,
  WorkboardStartRunResult,
  WorkboardTrackerSourceRecord,
} from './workboard.types'

export const workboardApi = {
  getSnapshot: (): Promise<WorkboardSnapshot> =>
    window.electronAPI.workboard.getSnapshot(),

  syncSources: (): Promise<WorkboardSnapshot> =>
    window.electronAPI.workboard.syncSources(),

  listTrackerSources: (): Promise<WorkboardTrackerSourceRecord[]> =>
    window.electronAPI.workboard.listTrackerSources(),

  upsertTrackerSource: (
    input: UpsertWorkboardTrackerSourceInput,
  ): Promise<WorkboardTrackerSourceRecord> =>
    window.electronAPI.workboard.upsertTrackerSource(input),

  listProjectMappings: (): Promise<WorkboardProjectMappingRecord[]> =>
    window.electronAPI.workboard.listProjectMappings(),

  upsertProjectMapping: (
    input: UpsertWorkboardProjectMappingInput,
  ): Promise<WorkboardProjectMappingRecord> =>
    window.electronAPI.workboard.upsertProjectMapping(input),

  startRun: (input: StartWorkboardRunInput): Promise<WorkboardStartRunResult> =>
    window.electronAPI.workboard.startRun(input),

  stopRun: (runId: string): Promise<WorkboardSnapshot> =>
    window.electronAPI.workboard.stopRun(runId),

  onSnapshotUpdated: (callback: (snapshot: WorkboardSnapshot) => void) =>
    window.electronAPI.workboard.onSnapshotUpdated(callback),
}
