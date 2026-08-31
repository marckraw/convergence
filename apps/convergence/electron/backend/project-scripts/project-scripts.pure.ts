import { resolve } from 'path'
import {
  parseProjectScriptIconId,
  parseProjectScriptRunStatus,
  type ProjectScriptIconId,
  type ProjectScriptRunStatus,
} from './project-scripts.types'

export function normalizeProjectScriptRequiredText(
  value: string,
  label: string,
): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${label} is required`)
  }
  return normalized
}

export function normalizeProjectScriptIcon(
  value: ProjectScriptIconId | undefined,
): ProjectScriptIconId {
  return value ? parseProjectScriptIconId(value) : 'play'
}

export function normalizeProjectScriptOptionalCwd(
  value: string | null | undefined,
  basePath?: string,
): string | null {
  const normalized = value?.trim()
  return normalized ? resolve(basePath ?? process.cwd(), normalized) : null
}

export function assertProjectScriptRunStatus(
  value: ProjectScriptRunStatus,
): asserts value is ProjectScriptRunStatus {
  parseProjectScriptRunStatus(value)
}
