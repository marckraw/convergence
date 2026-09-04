import { lstatSync, realpathSync } from 'fs'
import { mkdir, rmdir, statfs } from 'fs/promises'
import { basename, dirname, join, resolve } from 'path'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { ProjectRow } from '../database/database.types'
import { isContainedPath } from '../git/git-clone.pure'
import type { GitService } from '../git/git.service'
import { normalizeProjectSettings } from '../project/project-settings.pure'
import { projectFromRow, type Project } from '../project/project.types'
import {
  copyLaneTreeEntries,
  listLaneTreeFiles,
  listLaneTreePaths,
  listLaneTreeSockets,
  listLaneTreeUncopyable,
  removeLanePaths,
  removeLaneTree,
  statLaneFileSizes,
} from './lane-fs'
import {
  deriveLaneCopyMethod,
  isLaneCopySkipped,
  laneProjectName,
  resolveLaneTargetPath,
  validateLaneName,
  type LaneCopyMethod,
} from './lane.pure'
import type { CreateLaneInput, LaneCreateProgressPhase } from './lane.types'

export type { LaneCopyMethod } from './lane.pure'

export interface LaneCreateResult {
  lane: Project
  /**
   * How the bytes got there, OBSERVED (MAR-2783 round 3, H1): `clonefile`
   * when the volume gave up less than the clone budget for the copy, `bytes`
   * when it paid for the copy in full -- which the dialog shows in amber,
   * because a lane that took minutes and the disk to match is something the
   * general should know about.
   */
  copyMethod: LaneCopyMethod
  /**
   * What did not go to plan but did not stop the lane, in sentences the door
   * shows in amber: an origin that could not be fetched (round 2, L2), a
   * socket left behind (round 4, M1), and a branch whose two tips have
   * diverged (round 4, M2).
   */
  warnings: string[]
}

/**
 * The one copy primitive a lane is made with, as a port so the composition
 * test can exercise the real one and a unit can plant a failing one. The
 * target folder EXISTS and is empty when this is called: the service reserves
 * it first (M1) and the copy fills it. `shouldSkip` is the skip list, offered
 * so a primitive that CAN filter (Node's `cp`) does not carry what the prune
 * would only delete; a primitive that cannot (`cp -c -R`) may ignore it below
 * the top level, since `copyLaneTree` prunes the target afterwards.
 */
export interface LaneTreeCopier {
  (
    sourcePath: string,
    targetPath: string,
    shouldSkip: (relativePath: string) => boolean,
  ): Promise<void>
}

export interface LaneCopyObservation {
  copyMethod: LaneCopyMethod
  /** Regular-file bytes the pre-scan counted outside the skip list. */
  copiedBytes: number
  /** Free bytes the target's volume had before the copy minus after. */
  consumedBytes: number
  /**
   * Sockets the pre-scan met, by path relative to the root, sorted: nothing
   * copies one, so the lane is made without them and the door says which
   * (round 4, M1).
   */
  socketPaths: string[]
}

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Ruling 2 (MAR-2814): a rollback never masks the cause.
 *
 * What the installed app told Marcin was the CLEANUP's `ENOTEMPTY`, thrown out
 * of `release()` over the top of whatever had really failed -- so the dialog
 * named a folder inside `Electron.app` and never the reason, and the run that
 * diagnosed this had to work backwards from debris. The error that leaves here
 * is the ORIGINAL one: same object, same `code`, its own sentence FIRST, with
 * the cleanup's failure attached as `cause` and disclosed in one appended
 * sentence. A rollback that fails is worth saying; it is never the story.
 */
function withFailedRollback(
  cause: unknown,
  cleanupError: unknown,
  targetPath: string,
): Error {
  const original =
    cause instanceof Error ? cause : new Error(errorMessage(cause))
  original.message = `${original.message} — and the half-made folder could not be removed: ${targetPath}`
  original.cause = cleanupError
  return original
}

/**
 * darwin: `cp -c -R` -- BSD cp with `clonefile(2)`. This is the primitive the
 * lane design is built on and the only one that clones on macOS: libuv's
 * darwin copy goes through `copyfile(3)`, which byte-copies whatever flag Node
 * passes (MAR-2783 round 3, H1 -- measured: 512 MB consumed by every Node
 * mode, 0 by `cp -c`).
 */
export function makeDarwinCloneCopier(): LaneTreeCopier {
  return (sourcePath, targetPath, shouldSkip) =>
    copyLaneTreeEntries(sourcePath, targetPath, shouldSkip, ['-c', '-R'])
}

/**
 * Everywhere else: the same `cp` without `-c` -- a byte copy, and honest about
 * it through the same observation (CI is ext4).
 *
 * It was Node's `cp` until MAR-2814. Node's copy walks the source through the
 * patched `fs` to apply its filter, which makes it the same defect wearing the
 * other platform's clothes -- so the two copiers are now ONE shape differing
 * by one flag, and neither of them can read a tree through the patch.
 */
export function makeByteCopier(): LaneTreeCopier {
  return (sourcePath, targetPath, shouldSkip) =>
    copyLaneTreeEntries(sourcePath, targetPath, shouldSkip, ['-R'])
}

export function selectLaneTreeCopier(
  platform: NodeJS.Platform = process.platform,
): LaneTreeCopier {
  return platform === 'darwin' ? makeDarwinCloneCopier() : makeByteCopier()
}

/**
 * The pre-scan (H1): every regular file outside the skip list, sized before a
 * byte moves, so the clone budget has a true sum to be a tenth of; and every
 * socket recorded by relative path so the result can name what the lane went
 * without (round 4, M1 -- ruled A: a socket is never refused; `cp -R` cannot
 * carry one, and `core.fsmonitor` plants one in `.git` that git respawns
 * within a second, so refusing would lock such a root out of lanes forever).
 *
 * The walk is `find`'s and the sizes are `stat`'s (MAR-2814). A Node `lstat`
 * of an archive answers "directory" under the patch, so the old scan dropped
 * every archive's real bytes and counted its virtual children instead --
 * measured on the canary's fixture: 27 759 scanned against 137 889 on disk.
 * The clone budget is a tenth of this sum, so a wrong sum is a wrong amber
 * line on the door.
 */
async function scanLaneTree(
  sourcePath: string,
  shouldSkip: (relativePath: string) => boolean,
): Promise<{ copiedBytes: number; socketPaths: string[] }> {
  const [filePaths, socketPaths] = await Promise.all([
    listLaneTreeFiles(sourcePath),
    listLaneTreeSockets(sourcePath),
  ])
  const keptFiles = filePaths.filter(
    (relativePath) => !shouldSkip(relativePath),
  )
  const sizes = await statLaneFileSizes(sourcePath, keptFiles)
  return {
    copiedBytes: sizes.reduce((total, size) => total + size, 0),
    // `find` walks in the order the filesystem answers in, which is nobody's;
    // the door reads them in one.
    socketPaths: socketPaths
      .filter((relativePath) => !shouldSkip(relativePath))
      .sort(),
  }
}

/**
 * The prune (H1): the target read with the ONE skip predicate, so whatever the
 * primitive carried that the lane does not keep -- the skip list at any depth,
 * a FIFO `cp -R` recreated -- is removed after the copy. Clones are free, so
 * copying and pruning costs nothing a filter would have saved.
 *
 * Both the listing and the delete are `find`'s and `rm`'s (MAR-2814) -- for
 * UNIFORMITY, not because this step was the one that broke. Measured: routing
 * this prune back through Node's `fs` leaves the canary green under Electron
 * too, because a `readdir` of an archive's PARENT still reports the archive as
 * a file, so the walk never descends into it and never asks `rm` for a path
 * that is not on disk. The step that actually failed on the installed app was
 * the rollback; see `release()`. What this rewrite buys is that no caller has
 * to know which walks the patch can reach and which it cannot -- the module
 * next door is the only one that reads or removes a tree, so the wrong form is
 * not available to be chosen by accident a third time.
 *
 * Only the TOPMOST skipped path of each run is handed to `rm -rf`, which takes
 * the rest with it: the predicate reads a path's segments left to right, so a
 * skipped path's children are skipped too, and the shorter argument lists are
 * free.
 */
async function pruneLaneTree(
  targetPath: string,
  shouldSkip: (relativePath: string) => boolean,
): Promise<void> {
  const [paths, uncopyablePaths] = await Promise.all([
    listLaneTreePaths(targetPath),
    listLaneTreeUncopyable(targetPath),
  ])
  const skipped = new Set(
    paths.filter((relativePath) => shouldSkip(relativePath)),
  )
  const topmostSkipped = [...skipped].filter(
    (relativePath) => !skipped.has(dirname(relativePath)),
  )
  await removeLanePaths(targetPath, [...topmostSkipped, ...uncopyablePaths])
}

async function freeBytesOn(path: string): Promise<number> {
  const stats = await statfs(path)
  return stats.bavail * stats.bsize
}

/**
 * The observed copy (MAR-2783 round 3, H1): pre-scan, free bytes before,
 * the primitive, the prune, free bytes after -- and the method derived from
 * what the volume gave up against what was copied, never from a flag or an
 * errno. `man cp` says `-c` falls back to a byte copy silently, and Node
 * cannot clone on darwin at all; only the artifact can answer.
 */
export async function copyLaneTree(
  sourcePath: string,
  targetPath: string,
  copier: LaneTreeCopier,
  shouldSkip: (relativePath: string) => boolean = isLaneCopySkipped,
  /**
   * The volume reading, as a port: a canary can hand this a known drop and
   * ask what the SUM made of it, without a gigabyte of real bytes.
   */
  readFreeBytes: (path: string) => Promise<number> = freeBytesOn,
): Promise<LaneCopyObservation> {
  const { copiedBytes, socketPaths } = await scanLaneTree(
    sourcePath,
    shouldSkip,
  )
  const freeBefore = await readFreeBytes(targetPath)
  await copier(sourcePath, targetPath, shouldSkip)
  await pruneLaneTree(targetPath, shouldSkip)
  const consumedBytes = freeBefore - (await readFreeBytes(targetPath))
  return {
    copyMethod: deriveLaneCopyMethod({ copiedBytes, consumedBytes }),
    copiedBytes,
    consumedBytes,
    socketPaths,
  }
}

/**
 * M1: the folder is the lock. The parent may be made recursively (shared,
 * harmless), the target itself never: EEXIST means someone else owns it.
 * L1 (round 3): a sibling's `release()` may `rmdir` the shared parent between
 * the two calls, which surfaces as ENOENT on the target; the pair is retried
 * once, since the parent is ours to remake.
 */
export async function reserveLaneFolder(
  targetPath: string,
  makeDirectory: typeof mkdir = mkdir,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    await makeDirectory(dirname(targetPath), { recursive: true })
    try {
      await makeDirectory(targetPath)
      return
    } catch (error) {
      const code = errorCode(error)
      if (code === 'EEXIST') {
        throw new Error(`Lane folder already exists: ${targetPath}`, {
          cause: error,
        })
      }
      if (code === 'ENOENT' && attempt === 0) continue
      throw error
    }
  }
}

/**
 * The real path of `path`, resolving symlinks in as much of it as exists, so
 * a lanes root that is not yet on disk can still be compared with a folder
 * that is.
 */
function realpathOfNearestExisting(path: string): string {
  let current = resolve(path)
  const missing: string[] = []
  for (;;) {
    try {
      return join(realpathSync(current), ...missing)
    } catch {
      const parent = dirname(current)
      if (parent === current) return join(current, ...missing)
      missing.unshift(basename(current))
      current = parent
    }
  }
}

/**
 * Service (domain role): makes a lane -- a project's own copy with its own git
 * (MAR-2783, slice L1). The boundary exists so the three facts a lane is made
 * of (a folder, a checked-out branch, a project row) are committed in one
 * fixed order with one rollback rule, and nothing else in the app has to know
 * that order.
 *
 * Atomicity, in so many words: the target folder is RESERVED first with a
 * non-recursive `mkdir` (the folder is the lock: a second creation of the same
 * lane gets EEXIST and never owns it -- M1), everything expensive happens
 * inside the reservation, and the row is written LAST. Any failure inside the
 * reservation removes the folder and writes nothing, so the record never
 * names a folder that is not a working lane; and a failure after the row is
 * written is impossible by ordering, because nothing runs after it.
 */
export class LaneService {
  constructor(
    private readonly db: Database.Database,
    private readonly git: GitService,
    /**
     * Read per call, never captured: the lanes root is a setting, and the one
     * a lane is made under is the one in force at that moment.
     */
    private readonly resolveLanesRoot: () => string,
    private readonly copier: LaneTreeCopier = selectLaneTreeCopier(),
  ) {}

  async create(
    input: CreateLaneInput,
    onProgress: (phase: LaneCreateProgressPhase) => void = () => {},
  ): Promise<LaneCreateResult> {
    const laneName = validateLaneName(input.laneName)
    const branchName = input.branchName.trim()
    if (!branchName) throw new Error('Branch name is required.')

    const root = this.getRow(input.rootProjectId)
    if (!root) throw new Error(`Project not found: ${input.rootProjectId}`)
    if (root.lane_of !== null) {
      throw new Error(
        'A lane is made from a root project, not from another lane.',
      )
    }
    if (this.laneExists(root.id, laneName)) {
      throw new Error(`Lane "${laneName}" already exists for ${root.name}.`)
    }
    assertRootOwnsItsGitDirectory(root.repository_path)
    // L1: git's own answer on the name, before minutes of copying in its name.
    await this.git.validateBranchName(root.repository_path, branchName)

    const lanesRoot = this.resolveLanesRoot()
    assertDisjoint(root.repository_path, lanesRoot)
    const targetPath = resolveLaneTargetPath(lanesRoot, root.id, laneName)
    if (this.getRowByRepositoryPath(targetPath)) {
      throw new Error(`A project already lives at ${targetPath}`)
    }

    await reserveLaneFolder(targetPath)

    // From here this call owns the folder; every exit that is not the row
    // being written gives it back.
    const warnings: string[] = []
    let copyMethod: LaneCopyMethod
    let id: string
    try {
      onProgress('copying')
      const copied = await copyLaneTree(
        root.repository_path,
        targetPath,
        this.copier,
      )
      copyMethod = copied.copyMethod
      warnings.push(
        ...copied.socketPaths.map(
          (socketPath) =>
            `Left behind: ${socketPath} (a socket — nothing to copy)`,
        ),
      )

      onProgress('preparing-branch')
      await this.prepareBranch(root, targetPath, branchName, warnings)

      // Last, and alone: a throw here leaves nothing behind either, which the
      // next attempt may simply retry.
      onProgress('recording')
      id = this.insertRow(root, targetPath, laneName)
    } catch (error) {
      try {
        await this.release(targetPath)
      } catch (cleanupError) {
        throw withFailedRollback(error, cleanupError, targetPath)
      }
      throw error
    }

    onProgress('done')
    return { lane: projectFromRow(this.getRow(id)!), copyMethod, warnings }
  }

  /**
   * Gives the reservation back, and the `<lanesRoot>/<rootId>/` above it when
   * this was its only lane (L9): `rmdir` is non-recursive, so a parent with
   * sibling lanes in it simply refuses and stays.
   *
   * The tree goes by `rm -rf` (MAR-2814): Node's `rm` cannot remove a copied
   * `Electron.app`, because the patch tells it the archives inside are folders
   * and then will not let it `rmdir` them.
   */
  private async release(targetPath: string): Promise<void> {
    await removeLaneTree(targetPath)
    await rmdir(dirname(targetPath)).catch(() => {})
  }

  /**
   * In the copy: back to HEAD (the root's uncommitted edits are the root's --
   * L4), fetch if origin answers (an origin that does not is a warning, not a
   * rollback: the copied `.git` already carries `origin/*` -- L2), then the
   * branch. A lane may adopt a branch already underway rather than fork a
   * second one of the same name, and when BOTH sides carry it the rule is one
   * shape (round 4, M2): ADOPT THE TIP THAT CONTAINS THE OTHER. Local contains
   * origin -> plain `checkout` at the root's tip (a `-B` from origin would
   * silently throw away unpushed commits); origin contains local -> `checkout
   * -B` from `origin/<branch>` (a stale local must not win); neither -> they
   * have diverged, the root's is taken and the result says so, because only
   * the general can settle which history the lane wants. One side only is that
   * side; neither is `checkout -B` from the root's resolved base.
   */
  private async prepareBranch(
    root: ProjectRow,
    lanePath: string,
    branchName: string,
    warnings: string[],
  ): Promise<void> {
    const settings = normalizeProjectSettings(JSON.parse(root.settings))
    await this.git.resetWorkingTreeToHead(lanePath)

    const hasOrigin = (await this.git.getRemoteUrl(lanePath)) !== null
    if (hasOrigin) {
      try {
        await this.git.fetchRemote(lanePath)
      } catch (error) {
        warnings.push(
          `Could not fetch origin (${errorMessage(error)}); the branch was cut from the refs the copy already had.`,
        )
      }
    }

    const remoteRef = `origin/${branchName}`
    const hasRemoteBranch =
      hasOrigin && (await this.git.remoteBranchExists(lanePath, branchName))
    const hasLocalBranch = await this.git.branchExists(lanePath, branchName)

    if (hasRemoteBranch && hasLocalBranch) {
      if (await this.git.refContains(lanePath, branchName, remoteRef)) {
        await this.git.checkoutExistingBranch(lanePath, branchName)
        return
      }
      if (await this.git.refContains(lanePath, remoteRef, branchName)) {
        await this.git.checkoutBranch(lanePath, branchName, remoteRef)
        return
      }
      warnings.push(
        `${remoteRef} and the root's ${branchName} have diverged; the lane took the root's.`,
      )
      await this.git.checkoutExistingBranch(lanePath, branchName)
      return
    }
    if (hasRemoteBranch) {
      await this.git.checkoutBranch(lanePath, branchName, remoteRef)
      return
    }
    if (hasLocalBranch) {
      await this.git.checkoutExistingBranch(lanePath, branchName)
      return
    }
    const startPoint = await this.git.resolveBaseBranchStartPoint(
      lanePath,
      settings.workspaceCreation.baseBranchName,
      // Fetched once above, or unreachable: either way not again.
      { fetch: false },
    )
    await this.git.checkoutBranch(lanePath, branchName, startPoint)
  }

  private insertRow(root: ProjectRow, targetPath: string, laneName: string) {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO projects (id, name, repository_path, settings, lane_of, lane_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        laneProjectName(root.name, laneName),
        targetPath,
        root.settings,
        root.id,
        laneName,
      )
    return id
  }

  private laneExists(rootId: string, laneName: string): boolean {
    return (
      this.db
        .prepare(
          'SELECT 1 FROM projects WHERE lane_of = ? AND lane_name = ? LIMIT 1',
        )
        .get(rootId, laneName) !== undefined
    )
  }

  private getRow(id: string): ProjectRow | null {
    return (
      (this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
        | ProjectRow
        | undefined) ?? null
    )
  }

  private getRowByRepositoryPath(path: string): ProjectRow | null {
    return (
      (this.db
        .prepare('SELECT * FROM projects WHERE repository_path = ?')
        .get(path) as ProjectRow | undefined) ?? null
    )
  }
}

/**
 * M3: a linked worktree's `.git` is a FILE (`gitdir: …/.git/worktrees/<n>`)
 * naming another checkout's git directory. Copied verbatim, a `checkout -B`
 * in the lane would move THAT checkout's HEAD -- the one invariant the lane
 * design leans on. L1 refuses; lanes are made from a main checkout. The
 * same door has a second key (round 3, M1): a `.git` that is a SYMLINK to
 * another checkout's git directory reads as a directory through `stat` and
 * is carried verbatim by the copy -- so `lstat`, and a link is refused too.
 */
function assertRootOwnsItsGitDirectory(repositoryPath: string): void {
  const gitPath = join(repositoryPath, '.git')
  let ownsGitDirectory: boolean
  try {
    // lstat, never stat: a link to a directory must not read as one.
    ownsGitDirectory = lstatSync(gitPath).isDirectory()
  } catch (error) {
    throw new Error(`Not a git repository: ${repositoryPath}`, { cause: error })
  }
  if (!ownsGitDirectory) {
    throw new Error(
      `${repositoryPath} is a linked worktree: its .git is a file or link pointing at another checkout's git directory, so a lane's checkout would move that checkout's branch. Make lanes from the main checkout instead.`,
    )
  }
}

/**
 * M2: a lanes root inside the project would copy the project into itself
 * (through a symlink, until the path runs out of room); a project inside the
 * lanes root is the same knot from the other side. Both sides are compared by
 * their real paths, so a symlink cannot hide either.
 */
function assertDisjoint(repositoryPath: string, lanesRoot: string): void {
  const rootReal = realpathOfNearestExisting(repositoryPath)
  const lanesReal = realpathOfNearestExisting(lanesRoot)
  if (isContainedPath(rootReal, lanesReal)) {
    throw new Error(
      `The lanes root (${lanesRoot}) is inside the project (${repositoryPath}); a lane would be copied into itself. Move the lanes root first.`,
    )
  }
  if (isContainedPath(lanesReal, rootReal)) {
    throw new Error(
      `The project (${repositoryPath}) is inside the lanes root (${lanesRoot}). Move the lanes root first.`,
    )
  }
}
