import { basename } from 'path'

export function normalizeRequiredText(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required`)
  }
  return trimmed
}

export function normalizeOptionalText(value: string | undefined): string {
  return value?.trim() ?? ''
}

export function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '_')
  return sanitized.length > 0 ? sanitized.slice(0, 200) : 'space'
}

export function sanitizeFilename(path: string): string {
  const name = basename(path).replace(/\s+/g, '_')
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  return sanitized.length > 0 ? sanitized.slice(0, 200) : 'source'
}
