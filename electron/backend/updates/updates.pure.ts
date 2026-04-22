import type {
  FormattedUpdateProgress,
  UpdateProgressInput,
} from './updates.types'

const MAX_ERROR_MESSAGE_LENGTH = 120

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const partsA = parseVersion(a)
  const partsB = parseVersion(b)
  const length = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < length; i += 1) {
    const left = partsA[i] ?? 0
    const right = partsB[i] ?? 0
    if (left < right) return -1
    if (left > right) return 1
  }
  return 0
}

function parseVersion(raw: string): number[] {
  const stripped = raw.replace(/^v/, '').split('-')[0] ?? ''
  if (!stripped) return []
  return stripped.split('.').map((segment) => {
    const n = Number.parseInt(segment, 10)
    return Number.isFinite(n) ? n : 0
  })
}

export function formatProgress(
  input: UpdateProgressInput,
): FormattedUpdateProgress {
  const percent = clamp(Math.round(input.percent), 0, 100)
  const humanSpeed = formatBytesPerSecond(Math.max(0, input.bytesPerSecond))
  return { percent, humanSpeed }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function formatBytesPerSecond(bps: number): string {
  if (bps < 1024) return `${Math.round(bps)} B/s`
  const kb = bps / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB/s`
  const mb = kb / 1024
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB/s`
}

const ERROR_MAP: Record<string, string> = {
  ERR_UPDATER_LATEST_VERSION_NOT_FOUND: 'No releases published yet.',
  ERR_UPDATER_CHANNEL_FILE_NOT_FOUND: "Couldn't read update metadata.",
  ERR_UPDATER_INVALID_UPDATE_INFO: "Couldn't read update metadata.",
  ENOTFOUND: 'Offline or GitHub unreachable.',
  ETIMEDOUT: 'Offline or GitHub unreachable.',
  ECONNRESET: 'Offline or GitHub unreachable.',
  ECONNREFUSED: 'Offline or GitHub unreachable.',
  ERR_UPDATER_INVALID_SIGNATURE: 'Downloaded update failed verification.',
  ERR_UPDATER_NO_PUBLISH_CONFIG: 'Update server is misconfigured.',
}

interface MaybeErrorShape {
  code?: unknown
  message?: unknown
}

export function summarizeError(err: unknown): string {
  if (!err) return 'Unknown error.'
  const shape = toErrorShape(err)
  const code = typeof shape.code === 'string' ? shape.code : null
  if (code && ERROR_MAP[code]) return ERROR_MAP[code]
  const message =
    typeof shape.message === 'string' ? shape.message.trim() : null
  if (message) {
    for (const key of Object.keys(ERROR_MAP)) {
      if (message.includes(key)) return ERROR_MAP[key]
    }
    return truncate(message, MAX_ERROR_MESSAGE_LENGTH)
  }
  return 'Unknown error.'
}

function toErrorShape(value: unknown): MaybeErrorShape {
  if (value && typeof value === 'object') return value as MaybeErrorShape
  if (typeof value === 'string') return { message: value }
  return {}
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`
}
