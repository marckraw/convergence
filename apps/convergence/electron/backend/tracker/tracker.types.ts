/**
 * The tracker seam (MAR-3084 R1, R8).
 *
 * Ports and adapters: the app speaks the tracker's nouns -- an issue, its
 * holder, its wave, its logical status -- and one adapter per tracker turns
 * those into the far side's own shapes. Linear is the first adapter; nothing
 * outside `linear-tracker.*` may know a Linear field name.
 *
 * READ-ONLY by construction. The app records what the tracker says and never
 * writes back, so the port has exactly the two read methods below; a source
 * test pins that set.
 */

export type {
  TrackerLogicalStatus,
  TrackerKind,
  TrackerBinding,
  TrackerIssue,
  TrackerRefusalKind,
  TrackerRefusal,
  TrackerProbe,
  TrackerProjectMatch,
  TrackerProjectResolution,
  ListLabeledIssuesInput,
} from '../../../src/shared/types/tracker.types'
import type {
  ListLabeledIssuesInput,
  TrackerIssue,
  TrackerLogicalStatus,
  TrackerProbe,
  TrackerProjectResolution,
  TrackerRefusal,
} from '../../../src/shared/types/tracker.types'

export const TRACKER_LOGICAL_STATUSES: readonly TrackerLogicalStatus[] = [
  'backlog',
  'todo',
  'in-progress',
  'in-review',
  'reviewed',
  'done',
  'other',
]

/**
 * A refusal travelling through a promise. A typed value, never a thrown
 * string: the watcher reads `refusal.kind`, not a message.
 */
export class TrackerRefusalError extends Error {
  constructor(readonly refusal: TrackerRefusal) {
    super(refusal.message)
    this.name = 'TrackerRefusalError'
  }
}

export interface TrackerAdapter {
  probe(): Promise<TrackerProbe>
  listLabeledIssues(input: ListLabeledIssuesInput): Promise<TrackerIssue[]>
  /**
   * Finds the project a person named by URL, name or id (MAR-3156). A READ:
   * it asks which project answers to a reference and returns what it found,
   * and nothing about it can change anything on the far side.
   */
  resolveProject(reference: string): Promise<TrackerProjectResolution>
}
