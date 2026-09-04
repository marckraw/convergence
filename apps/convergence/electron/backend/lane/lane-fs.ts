import { execFile } from 'child_process'
import { join } from 'path'
import { redactUrlCredentials } from '../git/git-redact.pure'
import { relativeToCopyRoot } from './lane.pure'

/**
 * Anti-corruption layer (domain role: every walk and every delete a lane
 * performs on a real tree, and the only ones it is allowed).
 *
 * The boundary exists because inside an Electron main process Node's `fs` is
 * PATCHED (MAR-2814): an `*.asar` file reads as a DIRECTORY -- `readdir` lists
 * the archive's entries, `lstat` calls it a directory -- while `unlink` and
 * `rmdir` stay real. A checkout carries the `*.asar` archives Electron ships
 * in `node_modules/electron/dist/Electron.app/Contents/Resources/` (on
 * Electron 41, `default_app.asar`), so a Node walk of a lane descends into an
 * archive as though it were a folder, a Node delete unlinks its virtual
 * children into ENOENT and then cannot `rmdir` the archive itself, and the
 * parent reports `ENOTEMPTY` -- which is exactly the sentence the installed
 * app gave Marcin on his first lane.
 *
 * `find`, `stat`, `rm` and `cp` are separate PROCESSES. They see the real
 * filesystem no matter who asks, so this module behaves identically in
 * Electron's main process and under the plain Node that vitest runs. That
 * identity is the property RUN40 did not have -- every canary it wrote passed
 * under Node while production ran through the patch -- and it is why the
 * escape is by construction here and not by a flag (`process.noAsar`) that
 * some other line can be wrong about.
 *
 * The rule this module enforces on its callers: nothing outside it may reach
 * for `node:fs` to read or remove a lane's tree. `mkdir`, `rmdir` and `statfs`
 * of the lane's own reservation are untouched by the patch and stay where
 * they are.
 */

/**
 * The output ceiling for one tool. `find` over a real checkout's
 * `node_modules` prints on the order of 10 MiB of paths; `execFile`'s default
 * of 1 MiB would kill the process mid-listing, and a prune that read a
 * truncated listing would silently leave whatever fell off the end inside the
 * lane.
 */
const MAX_TOOL_OUTPUT_BYTES = 128 * 1024 * 1024

/**
 * How many bytes of path arguments one `stat` or `rm` may carry. `ARG_MAX` is
 * 1 MiB on darwin and about 2 MiB on Linux, and the environment is counted
 * against the same budget; a tenth of the smaller one leaves room for it.
 */
const MAX_ARGUMENT_BYTES = 100_000

/**
 * The same runner discipline git's has: an argument LIST, never a shell
 * string, and stderr through the credential redaction before it can become an
 * error the renderer shows.
 */
export function runLaneTool(command: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      { maxBuffer: MAX_TOOL_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(redactUrlCredentials(stderr.trim() || error.message)),
          )
        } else {
          resolvePromise(stdout)
        }
      },
    )
  })
}

/**
 * Arguments split into runs no bigger than `MAX_ARGUMENT_BYTES`, so a tree
 * with a hundred thousand files becomes a handful of `stat` or `rm` calls
 * instead of one the kernel refuses with E2BIG.
 */
function* batchByArgumentBytes(args: readonly string[]): Generator<string[]> {
  let batch: string[] = []
  let bytes = 0
  for (const arg of args) {
    const cost = Buffer.byteLength(arg) + 1
    if (batch.length > 0 && bytes + cost > MAX_ARGUMENT_BYTES) {
      yield batch
      batch = []
      bytes = 0
    }
    batch.push(arg)
    bytes += cost
  }
  if (batch.length > 0) yield batch
}

/**
 * `find` under `root`, returned as paths RELATIVE to it so the skip predicate
 * can never depend on where the root happens to live.
 *
 * `-print0` and the NUL split are load-bearing: a path holding a newline would
 * otherwise arrive as two paths, and a prune that read one of those halves as
 * a whole path would delete something nobody asked it to.
 *
 * `-H` is load-bearing too, and only for the STARTING POINT: both BSD and GNU
 * `find` default to `-P`, under which a root that is itself a symlink is a
 * symlink and nothing below it is walked -- a lane of such a root would be
 * made empty and fail in git naming the wrong cause. A project row holds a
 * `resolve()`d path, never a realpath, so such roots exist. Symlinks INSIDE
 * the tree keep `-P`'s reading, which is the copy's own: a link rides along
 * as a link and is never descended into.
 */
async function findRelativePaths(
  root: string,
  predicate: readonly string[],
): Promise<string[]> {
  const stdout = await runLaneTool('find', [
    '-H',
    root,
    '-mindepth',
    '1',
    ...predicate,
    '-print0',
  ])
  return stdout
    .split('\0')
    .filter(Boolean)
    .map((path) => relativeToCopyRoot(root, path))
}

/** Every path under `root`: files, directories, and everything else. */
export function listLaneTreePaths(root: string): Promise<string[]> {
  return findRelativePaths(root, [])
}

/**
 * The entries directly inside `root`, the way a copier reads them before
 * handing each one to `cp`.
 */
export function listLaneTreeTopLevelNames(root: string): Promise<string[]> {
  return findRelativePaths(root, ['-maxdepth', '1'])
}

/** Every regular file under `root` -- an archive among them is one of these. */
export function listLaneTreeFiles(root: string): Promise<string[]> {
  return findRelativePaths(root, ['-type', 'f'])
}

/**
 * Every socket under `root`. Nothing copies one and nothing has to: the lane
 * is made without it and the result names it (MAR-2783 round 4, M1).
 */
export function listLaneTreeSockets(root: string): Promise<string[]> {
  return findRelativePaths(root, ['-type', 's'])
}

/**
 * Every entry no copier can carry -- a socket, a FIFO, a device. The negation
 * is exactly the copy's own reading: a file, a directory or a symlink rides
 * along, anything else does not, and the prune takes back whatever `cp -R`
 * recreated.
 */
export function listLaneTreeUncopyable(root: string): Promise<string[]> {
  return findRelativePaths(root, [
    '!',
    '-type',
    'f',
    '!',
    '-type',
    'd',
    '!',
    '-type',
    'l',
  ])
}

/**
 * `stat`'s size flag -- the one word in this module that is not the same
 * everywhere: BSD spells it `-f %z`, GNU `-c %s`. Both print the APPARENT
 * size (`st_size`), which is what the clone budget must be a tenth of: a
 * sparse file costs the copy everything it claims, not what it occupies.
 */
function statSizeArguments(platform: NodeJS.Platform): string[] {
  return platform === 'darwin' ? ['-f', '%z'] : ['-c', '%s']
}

/**
 * The byte size of each of `relativePaths`, in the same order.
 *
 * Paired by POSITION, never by name. `stat` prints one line per argument in
 * the order it was given them, so reading the Nth line as the Nth path's size
 * is exact -- while parsing `<size> <path>` lines would desync forever on the
 * first path containing a space. The count is checked rather than assumed,
 * because a short answer would otherwise shift every size after it onto the
 * wrong file and quietly change the copy method the door reports.
 */
export async function statLaneFileSizes(
  root: string,
  relativePaths: readonly string[],
  platform: NodeJS.Platform = process.platform,
): Promise<number[]> {
  const sizes: number[] = []
  const absolutePaths = relativePaths.map((relativePath) =>
    join(root, relativePath),
  )
  for (const batch of batchByArgumentBytes(absolutePaths)) {
    const stdout = await runLaneTool('stat', [
      ...statSizeArguments(platform),
      ...batch,
    ])
    const lines = stdout.split('\n').filter((line) => line !== '')
    if (lines.length !== batch.length) {
      throw new Error(
        `stat answered for ${lines.length} of ${batch.length} paths; their sizes cannot be paired.`,
      )
    }
    for (const line of lines) {
      const size = Number(line)
      if (!Number.isFinite(size)) {
        throw new Error(`stat answered "${line}", which is not a size.`)
      }
      sizes.push(size)
    }
  }
  return sizes
}

/**
 * `rm -rf`, the deleter -- and the only one this module offers, because
 * Node's `rm` is the half of the asar patch that stays REAL and so cannot
 * remove an archive it was told is a folder.
 */
export async function removeLaneTree(path: string): Promise<void> {
  await runLaneTool('rm', ['-rf', '--', path])
}

/** The same delete for many paths at once, in runs `ARG_MAX` can carry. */
export async function removeLanePaths(
  root: string,
  relativePaths: readonly string[],
): Promise<void> {
  const absolutePaths = relativePaths.map((relativePath) =>
    join(root, relativePath),
  )
  for (const batch of batchByArgumentBytes(absolutePaths)) {
    await runLaneTool('rm', ['-rf', '--', ...batch])
  }
}

/**
 * `cp` per top-level entry into the reserved folder, with the flags that
 * decide whether the bytes are cloned or paid for.
 *
 * `-R` without `-L` keeps symlinks as symlinks and recreates FIFOs; it has no
 * filter, so the skip list is applied at the top level here and by the prune
 * below it. Sockets it cannot carry are left where they are.
 */
export async function copyLaneTreeEntries(
  sourcePath: string,
  targetPath: string,
  shouldSkip: (relativePath: string) => boolean,
  flags: readonly string[],
): Promise<void> {
  for (const entry of await listLaneTreeTopLevelNames(sourcePath)) {
    if (shouldSkip(entry)) continue
    await runLaneTool('cp', [
      ...flags,
      '--',
      join(sourcePath, entry),
      join(targetPath, entry),
    ])
  }
}
