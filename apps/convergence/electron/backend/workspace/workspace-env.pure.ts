const TEMPLATE_ENV_FILE_NAMES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
])

/**
 * Path segments that are never a project's env — even when git lists them and
 * a pattern would match. Applied by `selectWorkspaceEnvPaths` (MAR-2778 R3).
 * Matching is exact segment equality (so "dist-tools" is not "dist").
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
 * double-star under apps, including zero intermediate segments). Template
 * names (.example / .sample / .template) are always excluded.
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
    .filter((segment) => segment.length > 0)
    .some((segment) => skipList.includes(segment))
}

/**
 * True when `childPath` is the same as or nested under `parentPath`
 * (both absolute / already realpath'd).
 */
export function isPathInside(childPath: string, parentPath: string): boolean {
  const child = normalizeRelativePath(childPath)
  const parent = normalizeRelativePath(parentPath).replace(/\/$/, '')
  if (child === parent) return true
  return child.startsWith(`${parent}/`)
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
  if (!pattern.includes('*') && !pattern.includes('?')) return false

  if (pattern.includes('?')) {
    const escaped = pattern
      .replace(/[.+^{}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${escaped}$`).test(fileName)
  }

  const [prefix, ...rest] = pattern.split('*')
  const suffix = rest.join('*')
  return fileName.startsWith(prefix) && fileName.endsWith(suffix)
}

const GLOB_STAR_AFTER_SLASH = '__GLOB_STAR_AFTER_SLASH__'
const GLOB_STAR_BEFORE_SLASH = '__GLOB_STAR_BEFORE_SLASH__'
const GLOB_STAR_BARE = '__GLOB_STAR_BARE__'

/**
 * Path glob: `*` = within one segment, `?` = one char in a segment,
 * `**` = any depth including zero intermediate segments
 * (so "apps/**" + "/.env" matches "apps/.env").
 */
function matchesPathGlob(relativePath: string, pattern: string): boolean {
  if (pattern === relativePath) return true
  if (!pattern.includes('*') && !pattern.includes('?')) return false

  // Expand `**` first into printable placeholders, then escape, then
  // single-segment wildcards — so the `*` inside injected `.*` is never
  // rewritten (and eslint no-control-regex stays quiet).
  const withDoubles = pattern
    .replace(/\/\*\*/g, GLOB_STAR_AFTER_SLASH)
    .replace(/\*\*\//g, GLOB_STAR_BEFORE_SLASH)
    .replace(/\*\*/g, GLOB_STAR_BARE)

  const escaped = withDoubles
    .replace(/[.+^{}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .split(GLOB_STAR_AFTER_SLASH)
    .join('(?:/.*)?')
    .split(GLOB_STAR_BEFORE_SLASH)
    .join('(?:.*/)?')
    .split(GLOB_STAR_BARE)
    .join('.*')

  return new RegExp(`^${escaped}$`).test(relativePath)
}
