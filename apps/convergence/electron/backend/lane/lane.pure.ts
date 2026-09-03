import { join, sep } from 'path'
import type { CreateLaneInput } from './lane.types'

/**
 * The lane name's alphabet (MAR-2783): lowercase letters, digits and hyphens,
 * one to forty long. It becomes a folder name under the lanes root and half of
 * the unique key under a root, so it is kept to characters no filesystem and
 * no shell will argue with.
 */
export const LANE_NAME_PATTERN = /^[a-z0-9-]{1,40}$/

export function validateLaneName(raw: string): string {
  const laneName = raw.trim()
  if (!LANE_NAME_PATTERN.test(laneName)) {
    throw new Error(
      'Lane name must be 1–40 characters of lowercase letters, digits and hyphens.',
    )
  }
  return laneName
}

/**
 * The folders a lane copy leaves behind (MAR-2783, ruling 3).
 *
 * Ignored files are INCLUDED on purpose -- `.env`, `node_modules`, gitignored
 * docs are the point of a clonefile copy over a worktree. What is skipped is
 * what the copy would only ever have to rebuild or must not share: the
 * checkout's OWN build output, git's lock files, and the root's worktree
 * metadata (a lane owns no worktrees of its root).
 *
 * "Own" is load-bearing: the skip list stops at a `node_modules` segment.
 * Installed packages ship `dist/` and `out/` folders of their own, and
 * `node_modules/electron/dist` is the Electron binary itself -- a lane that
 * dropped those could not start (round 2, H1).
 */
export const DEFAULT_LANE_COPY_SKIP_DIRECTORIES: readonly string[] = [
  'out',
  'release',
  'dist',
]

const INSTALLED_PACKAGES_SEGMENT = 'node_modules'

/**
 * Whether a path, relative to the copy's root, is left out of the lane.
 *
 * Takes the relative path rather than an absolute one so the answer cannot
 * depend on where the root happens to live: `/Users/x/dist-tools/out/` inside a
 * checkout is skipped because of the `out` segment, never because of `dist`
 * in the parent's name.
 */
export function isLaneCopySkipped(
  relativePath: string,
  skipDirectories: readonly string[] = DEFAULT_LANE_COPY_SKIP_DIRECTORIES,
): boolean {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean)
  if (segments.length === 0) return false

  if (segments[0] === '.git') {
    if (
      segments.length >= 2 &&
      segments[segments.length - 1]!.endsWith('.lock')
    )
      return true
    if (segments.length >= 2 && segments[1] === 'worktrees') return true
    return false
  }

  for (const segment of segments) {
    // Everything under installed packages is theirs, whatever it is called.
    if (segment === INSTALLED_PACKAGES_SEGMENT) return false
    if (skipDirectories.includes(segment)) return true
  }
  return false
}

/** `<lanesRoot>/<rootProjectId>/<laneName>` (MAR-2783, ruling 2). */
export function resolveLaneTargetPath(
  lanesRoot: string,
  rootProjectId: string,
  laneName: string,
): string {
  return join(lanesRoot, rootProjectId, laneName)
}

/** `<root> · lane: <name>` (MAR-2783, ruling 5). */
export function laneProjectName(rootName: string, laneName: string): string {
  return `${rootName} · lane: ${laneName}`
}

/**
 * The relative form `isLaneCopySkipped` reads, from the absolute path the copy
 * primitive hands its filter. An empty string for the root itself.
 */
export function relativeToCopyRoot(sourceRoot: string, path: string): string {
  if (path === sourceRoot) return ''
  const prefix = sourceRoot.endsWith(sep) ? sourceRoot : sourceRoot + sep
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

/**
 * H1 (round 3): the copy method is OBSERVED, never asked. `man cp` says `-c`
 * "will fallback to using copyfile(2)" silently, and Node cannot clone on
 * darwin in any mode; a flag is intent, the artifact is bytes on disk. So the
 * volume's free bytes are read before and after the copy, and a copy that
 * consumed less than this budget was a clone.
 */
export const CLONE_BUDGET_MIN_BYTES = 64 * 1024 * 1024
export const CLONE_BUDGET_FRACTION = 0.1

export type LaneCopyMethod = 'clonefile' | 'bytes'

export function deriveLaneCopyMethod(observed: {
  copiedBytes: number
  consumedBytes: number
}): LaneCopyMethod {
  const budget = Math.max(
    CLONE_BUDGET_MIN_BYTES,
    observed.copiedBytes * CLONE_BUDGET_FRACTION,
  )
  return observed.consumedBytes < budget ? 'clonefile' : 'bytes'
}

const CREATE_LANE_INPUT_SENTENCE =
  'Lane creation needs a root project id, a lane name and a branch name, each as text.'

/**
 * L2 (round 3): the IPC door's reading of its input. Anything but three
 * strings is refused with one sentence, so the service's `.trim()` can never
 * be the thing that answers.
 */
export function parseCreateLaneInput(raw: unknown): CreateLaneInput {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(CREATE_LANE_INPUT_SENTENCE)
  }
  const { rootProjectId, laneName, branchName } = raw as Record<string, unknown>
  if (
    typeof rootProjectId !== 'string' ||
    typeof laneName !== 'string' ||
    typeof branchName !== 'string'
  ) {
    throw new Error(CREATE_LANE_INPUT_SENTENCE)
  }
  return { rootProjectId, laneName, branchName }
}
