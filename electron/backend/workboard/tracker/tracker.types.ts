import type {
  UpsertWorkboardTrackerIssueInput,
  WorkboardTrackerSourceRecord,
  WorkboardTrackerType,
} from '../workboard.types'

export interface WorkboardTrackerProvider {
  type: WorkboardTrackerType
  syncSource: (
    source: WorkboardTrackerSourceRecord,
  ) => Promise<UpsertWorkboardTrackerIssueInput[]>
}

export type WorkboardFetcher = (
  url: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  },
) => Promise<{
  ok: boolean
  status: number
  statusText: string
  json: () => Promise<unknown>
  text: () => Promise<string>
}>
