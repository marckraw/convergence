export interface ReleaseNotesEntry {
  version: string
  date: string | null
  notes: string
}

export interface ReleaseNotesBundle {
  currentVersion: string
  generatedAt: string
  releases: ReleaseNotesEntry[]
}
