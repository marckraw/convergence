const TEMPLATE_ENV_FILE_NAMES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
])

/**
 * Path segments that are never a project's env — even when git lists them and
 * a pattern would match. Applied by `selectWorkspaceEnvPaths` (MAR-2778 R3).
 */
export const WORKSPACE_ENV_PATH_SKIP_SEGMENTS = [
  'node_modules',
  '.git',
  'out',
  'dist',
  'release',
  'coverage',
  '.turbo',
  '.next',
] as const

/**
 * Whether a settings pattern selects this relative path (or bare file name).
 *
 * Basename patterns (no slash) match the file's basename at any depth — so the
 * defaults ".env" / ".env.*" keep working for "apps/a/.env". Patterns that
 * contain a slash match the relative path as a glob (exact "apps/a/.env", or
 * double-star under apps). Template names (.example / .sample / .template)
 * are always excluded.
 */
export function matchesWorkspaceEnvFilePattern(
  relativePathOrFileName: string,
  patterns: string[],
): boolean {
  const basename = basenameOf(relativePathOrFileName)
  if (isTemplateEnvFileName(basename)) return false

  return patterns.some((pattern) => {
    if (pattern.includes('/')) {
      return matchesPathGlob(
        normalizeRelativePath(relativePathOrFileName),
        pattern,
      )
    }
    return matchesBasenamePattern(basename, pattern)
  })
}

/**
 * From a candidate list of relative paths, keep those that match the settings
 * patterns and are not under a skip-list segment.
 */
export function selectWorkspaceEnvPaths(
  relativePaths: string[],
  patterns: string[],
  skipList: readonly string[] = WORKSPACE_ENV_PATH_SKIP_SEGMENTS,
): string[] {
  return relativePaths.filter((relativePath) => {
    const normalized = normalizeRelativePath(relativePath)
    if (pathHasSkipSegment(normalized, skipList)) return false
    return matchesWorkspaceEnvFilePattern(normalized, patterns)
  })
}

export function pathHasSkipSegment(
  relativePath: string,
  skipList: readonly string[] = WORKSPACE_ENV_PATH_SKIP_SEGMENTS,
): boolean {
  return normalizeRelativePath(relativePath)
    .split('/')
    .some((segment) => skipList.includes(segment))
}

function basenameOf(relativePathOrFileName: string): string {
  const normalized = normalizeRelativePath(relativePathOrFileName)
  const slash = normalized.lastIndexOf('/')
  return slash >= 0 ? normalized.slice(slash + 1) : normalized
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.\//, '')
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

function matchesBasenamePattern(fileName: string, pattern: string): boolean {
  if (pattern === fileName) return true
  if (!pattern.includes('*')) return false

  const [prefix, ...rest] = pattern.split('*')
  const suffix = rest.join('*')
  return fileName.startsWith(prefix) && fileName.endsWith(suffix)
}

/**
 * Minimal path glob: `*` = one path segment fragment, `**` = any depth.
 * Exact equality still wins when the pattern has no wildcards.
 */
function matchesPathGlob(relativePath: string, pattern: string): boolean {
  if (pattern === relativePath) return true
  if (!pattern.includes('*')) return false

  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\0/g, '.*')
  return new RegExp(`^${escaped}$`).test(relativePath)
}
