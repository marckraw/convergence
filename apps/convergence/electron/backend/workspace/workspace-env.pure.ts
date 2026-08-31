const TEMPLATE_ENV_FILE_NAMES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
])

export function matchesWorkspaceEnvFilePattern(
  fileName: string,
  patterns: string[],
): boolean {
  if (isTemplateEnvFileName(fileName)) return false

  return patterns.some((pattern) => matchesPattern(fileName, pattern))
}

function isTemplateEnvFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return (
    TEMPLATE_ENV_FILE_NAMES.has(lower) ||
    lower.endsWith('.example') ||
    lower.endsWith('.sample') ||
    lower.endsWith('.template')
  )
}

function matchesPattern(fileName: string, pattern: string): boolean {
  if (pattern === fileName) return true
  if (!pattern.includes('*')) return false

  const [prefix, ...rest] = pattern.split('*')
  const suffix = rest.join('*')
  return fileName.startsWith(prefix) && fileName.endsWith(suffix)
}
