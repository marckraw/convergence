export const LIVENESS_QUIET_MS = 60_000
export const LIVENESS_SILENT_MS = 180_000

export type LivenessSignal =
  | { kind: 'fresh'; msSinceLastEvent: number }
  | { kind: 'quiet'; msSinceLastEvent: number }
  | { kind: 'silent'; msSinceLastEvent: number }

export interface LivenessInput {
  lastEventAt: number | null
  now: number
}

export function deriveLiveness(input: LivenessInput): LivenessSignal {
  if (input.lastEventAt === null) {
    return { kind: 'fresh', msSinceLastEvent: 0 }
  }
  const elapsed = Math.max(0, input.now - input.lastEventAt)
  if (elapsed >= LIVENESS_SILENT_MS) {
    return { kind: 'silent', msSinceLastEvent: elapsed }
  }
  if (elapsed >= LIVENESS_QUIET_MS) {
    return { kind: 'quiet', msSinceLastEvent: elapsed }
  }
  return { kind: 'fresh', msSinceLastEvent: elapsed }
}
