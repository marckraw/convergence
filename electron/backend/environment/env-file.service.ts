import { existsSync, readFileSync } from 'fs'

export function loadEnvFile(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!existsSync(filePath)) return

  const content = readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line
    const equalsIndex = normalized.indexOf('=')
    if (equalsIndex <= 0) continue

    const key = normalized.slice(0, equalsIndex).trim()
    const rawValue = normalized.slice(equalsIndex + 1).trim()
    if (!key || env[key] !== undefined) continue

    env[key] = stripQuotes(rawValue)
  }
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}
