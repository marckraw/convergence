import { JSONL_RETAIN_AGE_MS, JSONL_RETAIN_ROTATIONS } from './provider-debug.pure'

export interface RotationFile {
  filename: string
  rotationIndex: number
}

const ROTATION_PATTERN = /^(.+?)\.(\d+)\.jsonl$/
const ACTIVE_PATTERN = /^(.+?)\.jsonl$/

export function parseSessionLogFilename(
  filename: string,
): { sessionId: string; rotationIndex: number | null } | null {
  const rotation = ROTATION_PATTERN.exec(filename)
  if (rotation && rotation[1] && rotation[2]) {
    const idx = Number.parseInt(rotation[2], 10)
    if (!Number.isNaN(idx)) {
      return { sessionId: rotation[1], rotationIndex: idx }
    }
  }
  const active = ACTIVE_PATTERN.exec(filename)
  if (active && active[1] && !ROTATION_PATTERN.test(filename)) {
    return { sessionId: active[1], rotationIndex: null }
  }
  return null
}

export function nextRotationIndex(filenames: string[], sessionId: string): number {
  const indices = filenames
    .map(parseSessionLogFilename)
    .filter(
      (parsed): parsed is { sessionId: string; rotationIndex: number } =>
        !!parsed &&
        parsed.sessionId === sessionId &&
        parsed.rotationIndex !== null,
    )
    .map((parsed) => parsed.rotationIndex)
  return indices.length === 0 ? 1 : Math.max(...indices) + 1
}

export interface CleanupCandidate {
  filename: string
  mtimeMs: number
}

export function selectCleanupTargets(input: {
  candidates: CleanupCandidate[]
  knownSessionIds: ReadonlySet<string>
  now: number
  retainAgeMs?: number
  retainRotations?: number
}): string[] {
  const retainAgeMs = input.retainAgeMs ?? JSONL_RETAIN_AGE_MS
  const retainRotations = input.retainRotations ?? JSONL_RETAIN_ROTATIONS

  const byKey: string[] = []
  const rotationsBySession = new Map<string, CleanupCandidate[]>()

  for (const candidate of input.candidates) {
    const parsed = parseSessionLogFilename(candidate.filename)
    if (!parsed) continue

    if (!input.knownSessionIds.has(parsed.sessionId)) {
      byKey.push(candidate.filename)
      continue
    }

    if (input.now - candidate.mtimeMs >= retainAgeMs) {
      byKey.push(candidate.filename)
      continue
    }

    if (parsed.rotationIndex !== null) {
      const list = rotationsBySession.get(parsed.sessionId) ?? []
      list.push(candidate)
      rotationsBySession.set(parsed.sessionId, list)
    }
  }

  for (const [, list] of rotationsBySession) {
    if (list.length <= retainRotations) continue
    list.sort((a, b) => a.mtimeMs - b.mtimeMs)
    const excess = list.slice(0, list.length - retainRotations)
    for (const item of excess) byKey.push(item.filename)
  }

  return Array.from(new Set(byKey))
}
