import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

function getPiAuthPath(): string {
  return join(homedir(), '.pi', 'agent', 'auth.json')
}

export function isPiAuthConfigured(
  authPath: string = getPiAuthPath(),
): boolean {
  if (!existsSync(authPath)) return false
  try {
    const content = readFileSync(authPath, 'utf-8').trim()
    if (!content) return false
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object') return false
    return Object.keys(parsed as Record<string, unknown>).length > 0
  } catch {
    return false
  }
}
