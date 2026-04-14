export interface ReleaseNotesEntry {
  version: string
  date: string | null
  notes: string
}

export interface ReleaseNotesBundle {
  currentVersion: string
  releases: ReleaseNotesEntry[]
}
