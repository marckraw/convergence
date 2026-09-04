import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { createServer, type Server } from 'net'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'
import { GitService } from '../git/git.service'
import { isLaneCopySkipped, relativeToCopyRoot } from './lane.pure'
import {
  LaneService,
  copyLaneTree,
  makeDarwinCloneCopier,
  makeByteCopier,
} from './lane.service'

/**
 * The canary that runs under the REAL Electron runtime (MAR-2814).
 *
 * RUN40 shipped lanes with four rounds of review and a green suite, and the
 * first lane Marcin made on the installed app died on `ENOTEMPTY` inside
 * `Electron.app/Contents/Resources`. Nothing was under-tested: every canary
 * ran under plain Node, where Electron's asar `fs` patch does not exist, so
 * the fixture never agreed with the far side. This file is the far side.
 *
 * It is deliberately runtime-AGNOSTIC -- it imports nothing from `electron` --
 * so `tools/run-lane-electron-canary.mjs` can run the SAME bundle under the
 * `electron` binary and under plain `node`. That asymmetry IS the instrument,
 * and it is measured, not hoped for. Put the rollback back on Node's `rm` and
 * this script fails under Electron with Marcin's own sentence
 * (`ENOTEMPTY: directory not empty, rmdir …`) while staying green under Node;
 * the same for the pre-scan's sum and for a copier built on Node's `cp`. Only
 * the prune survives its own mutation, because a `readdir` of an archive's
 * parent still calls the archive a file -- which is why the checks below are
 * spread across the copy, the sum and the rollback rather than aimed at one
 * step someone guessed at.
 *
 * Every reading of the lane's tree below goes through a SUBPROCESS (`find`,
 * `cmp`, `cat`). Under Electron, `lstatSync` of a copied `*.asar` archive
 * answers "directory" whether or not the copy was correct, so an assertion
 * made with Node's `fs` would be unable to tell the fixed lane from the broken
 * one. The assertions have to leave the patch for the same reason the service
 * does.
 */

/** A failed check, remembered so one run reports every one of them. */
const failures: string[] = []
let checked = 0

function check(claim: string, holds: boolean, detail = ''): void {
  checked += 1
  if (holds) {
    console.log(`  ok   ${claim}`)
  } else {
    failures.push(claim)
    console.log(`  FAIL ${claim}${detail ? ` -- ${detail}` : ''}`)
  }
}

/**
 * `find`'s answer for one path -- the reading that matters most here, because
 * Node's would be the patch's opinion rather than the disk's.
 * `-maxdepth 0` asks about the path itself; a path that is not there makes
 * `find` exit non-zero, which is `absent`.
 */
function pathKind(path: string): 'file' | 'directory' | 'other' | 'absent' {
  const matches = (predicate: string[]): boolean => {
    try {
      return (
        execFileSync('find', [path, '-maxdepth', '0', ...predicate], {
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .toString()
          .trim() !== ''
      )
    } catch {
      return false
    }
  }
  if (matches(['-type', 'f'])) return 'file'
  if (matches(['-type', 'd'])) return 'directory'
  return matches([]) ? 'other' : 'absent'
}

function areBytesIdentical(left: string, right: string): boolean {
  try {
    execFileSync('cmp', ['-s', left, right])
    return true
  } catch {
    return false
  }
}

function readThroughSubprocess(path: string): string {
  return execFileSync('cat', [path]).toString()
}

function git(dir: string, args: string[]): void {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
}

/**
 * The schema the service writes into, copied from `database.ts` down to the
 * columns a lane row uses. A real temp SQLite through `node:sqlite`: the
 * built-in driver, so the canary needs no `electron-rebuild` of
 * `better-sqlite3` and cannot leave the tree's native ABI flipped under the
 * gates that run after it.
 */
function makeDatabase(path: string): Database.Database {
  const database = new DatabaseSync(path)
  database.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repository_path TEXT NOT NULL UNIQUE,
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      lane_of TEXT REFERENCES projects(id) ON DELETE CASCADE,
      lane_name TEXT
    );
  `)
  // `node:sqlite`'s `prepare().run()/.get()` is the whole surface LaneService
  // asks of its database; the type is better-sqlite3's because that is what
  // production hands it.
  return database as unknown as Database.Database
}

/**
 * A REAL asar out of this very tree -- located by `find`, because which
 * archives ship and where has changed across Electron versions (41 keeps only
 * `default_app.asar`, under `dist/Electron.app/Contents/Resources` on darwin
 * and `dist/resources` on Linux). Using the genuine article rather than a
 * packed imitation keeps the fixture the artifact from Marcin's error report,
 * and asking `find` for it rather than naming a path keeps this canary from
 * quietly testing an empty tree after the next Electron bump.
 */
function findRealAsarArchive(): string {
  const found = execFileSync('find', [
    join(process.cwd(), 'node_modules', 'electron', 'dist'),
    '-name',
    '*.asar',
    '-type',
    'f',
  ])
    .toString()
    .split('\n')
    .filter(Boolean)
  if (found.length === 0) {
    throw new Error(
      'No *.asar under node_modules/electron/dist; the canary needs a real archive to copy.',
    )
  }
  return found[0]!
}

/**
 * Where the fixture puts it: the exact path the installed app died inside,
 * under the archive's own name so the copy can be compared byte for byte.
 */
function asarPathInTree(archive: string): string {
  return join(
    'node_modules',
    'electron',
    'dist',
    'Electron.app',
    'Contents',
    'Resources',
    basename(archive),
  )
}

const SOCKET_IN_TREE = join('.git', 'fsmonitor--daemon.ipc')

/**
 * The second archive, placed OUTSIDE `node_modules` on purpose (see the
 * runner, which packs it with a `dist/` inside).
 *
 * A second archive is worth its keep because the first one sits under
 * `node_modules`, where `isLaneCopySkipped` returns false for everything and
 * so nothing the skip list does can be observed at all. This one is a live
 * candidate for the prune, and it holds a `dist/` the skip list would remove
 * if anything ever managed to look inside it -- so the pair of checks on it
 * says both halves at once: the archive arrives whole, and nothing mistook its
 * contents for a tree to prune. A copier on Node's `cp` turns it into a
 * FOLDER, which is the mutation these two checks answer.
 */
const PACKED_ASAR_IN_TREE = join('resources', 'app.asar')

/**
 * Every real file the lane must carry, summed through SUBPROCESSES -- the
 * measurement the pre-scan has to agree with. Under the patch a Node walk
 * counts an archive's imaginary contents instead of the archive, so the two
 * sums disagree the moment the scan reads the tree through it.
 */
function trueCopiedBytes(root: string): number {
  const paths = execFileSync('find', [root, '-mindepth', '1', '-type', 'f'])
    .toString()
    .split('\n')
    .filter(Boolean)
    .filter((path) => !isLaneCopySkipped(relativeToCopyRoot(root, path)))
  return execFileSync('stat', [
    ...(process.platform === 'darwin' ? ['-f', '%z'] : ['-c', '%s']),
    ...paths,
  ])
    .toString()
    .split('\n')
    .filter(Boolean)
    .reduce((total, line) => total + Number(line), 0)
}

/** The sentence the forced failure carries, so the check can look for it. */
const FORCED_FAILURE = 'forced: the branch could not be prepared'

/**
 * A git that fails INSIDE the reservation, after the copy has already put an
 * `Electron.app` in the lane -- the shape that produced Marcin's `ENOTEMPTY`,
 * because the rollback then had to remove an archive the patch calls a folder.
 */
class FailingGitService extends GitService {
  override async resetWorkingTreeToHead(): Promise<void> {
    throw new Error(FORCED_FAILURE)
  }
}

async function main(): Promise<void> {
  const runtime = process.versions.electron
    ? `electron ${process.versions.electron}`
    : `node ${process.versions.node}`
  console.log(`lane canary — runtime: ${runtime}`)

  // Short prefix on purpose: a unix socket path is capped at 104 bytes on
  // darwin, and the fsmonitor socket below must fit inside it.
  const tempDir = mkdtempSync(join(tmpdir(), 'cvg-can-'))
  const rootPath = join(tempDir, 'root')
  const lanesRoot = join(tempDir, 'lanes')
  const realAsar = findRealAsarArchive()
  const asarInTree = asarPathInTree(realAsar)
  // From the environment, not `argv`: Electron keeps its own switches in
  // `process.argv`, so a runtime flag would silently shift a positional
  // argument and hand this canary a file that is not an archive. The suffix is
  // checked for the same reason -- a fixture that is not an `*.asar` cannot
  // provoke the patch, and every check below it would pass for nothing.
  const packedAsar = process.env.CVG_LANE_CANARY_ASAR
  if (!packedAsar?.endsWith('.asar')) {
    throw new Error(
      `The canary needs the packed archive its runner builds, as CVG_LANE_CANARY_ASAR: an *.asar path, not ${packedAsar ?? 'nothing'}.`,
    )
  }
  let socket: Server | null = null

  try {
    mkdirSync(rootPath, { recursive: true })
    git(rootPath, ['init'])
    git(rootPath, ['config', 'user.email', 'canary@test.com'])
    git(rootPath, ['config', 'user.name', 'Canary'])
    writeFileSync(join(rootPath, 'README.md'), 'root\n')
    // `resources/` is ignored like the other artifacts a lane exists to carry:
    // `prepareBranch` runs `git clean -fd` in the copy, which would otherwise
    // take an untracked archive back out and leave this canary testing nothing.
    writeFileSync(
      join(rootPath, '.gitignore'),
      '.env\nout/\nnode_modules/\nresources/\n',
    )
    git(rootPath, ['add', '.'])
    git(rootPath, ['commit', '-m', 'init'])
    git(rootPath, ['branch', '-M', 'master'])

    // Ignored files are what a lane is FOR; build output is what it leaves.
    writeFileSync(join(rootPath, '.env'), 'SECRET=1\n')
    mkdirSync(join(rootPath, 'out'), { recursive: true })
    writeFileSync(join(rootPath, 'out', 'bundle.js'), 'built\n')

    // The archive, at the exact path the installed app died inside. Copied by
    // `cp`, because writing it with Node's `fs` under Electron would go
    // through the very patch this canary exists to outlast.
    mkdirSync(dirname(join(rootPath, asarInTree)), { recursive: true })
    execFileSync('cp', ['--', realAsar, join(rootPath, asarInTree)])

    // And the packed one outside node_modules, where the skip list still bites.
    mkdirSync(dirname(join(rootPath, PACKED_ASAR_IN_TREE)), { recursive: true })
    execFileSync('cp', ['--', packedAsar, join(rootPath, PACKED_ASAR_IN_TREE)])

    // What `core.fsmonitor` really leaves in `.git`: a live LISTENING socket.
    socket = createServer()
    await new Promise<void>((resolve) =>
      socket!.listen(join(rootPath, SOCKET_IN_TREE), resolve),
    )

    const db = makeDatabase(join(tempDir, 'canary.sqlite'))
    const rootId = 'root-project'
    db.prepare(
      `INSERT INTO projects (id, name, repository_path, settings)
       VALUES (?, 'convergence', ?, '{}')`,
    ).run(rootId, rootPath)

    const service = new LaneService(db, new GitService(), () => lanesRoot)

    // ---- The lane is made ------------------------------------------------
    const { lane, copyMethod, warnings } = await service.create({
      rootProjectId: rootId,
      laneName: 'studio',
      branchName: 'feat/studio',
    })
    const lanePath = lane.repositoryPath
    console.log(`  lane at ${lanePath} (copyMethod: ${copyMethod})`)

    check('the lane folder is made', pathKind(lanePath) === 'directory')
    check(
      'the copied .asar is a FILE, not a folder the patch invented',
      pathKind(join(lanePath, asarInTree)) === 'file',
      `find called it ${pathKind(join(lanePath, asarInTree))}`,
    )
    check(
      'the copied .asar is byte-identical to the source archive',
      areBytesIdentical(realAsar, join(lanePath, asarInTree)),
    )
    check(
      'the prune removed the checkout’s own out/',
      pathKind(join(lanePath, 'out')) === 'absent',
    )
    check(
      'the ignored .env rode along',
      readThroughSubprocess(join(lanePath, '.env')) === 'SECRET=1\n',
    )
    check(
      'the archive outside node_modules survived the prune, as a FILE',
      pathKind(join(lanePath, PACKED_ASAR_IN_TREE)) === 'file',
      `find called it ${pathKind(join(lanePath, PACKED_ASAR_IN_TREE))}`,
    )
    check(
      'and byte-identically, its packed dist/ untouched inside it',
      areBytesIdentical(packedAsar, join(lanePath, PACKED_ASAR_IN_TREE)),
    )
    check(
      'the socket was left behind',
      pathKind(join(lanePath, SOCKET_IN_TREE)) === 'absent',
    )
    check(
      'and the result names it',
      warnings.some((warning) => warning.includes(SOCKET_IN_TREE)),
      `warnings: ${JSON.stringify(warnings)}`,
    )
    check(
      'the branch is cut in the lane',
      execFileSync('git', ['branch', '--show-current'], { cwd: lanePath })
        .toString()
        .trim() === 'feat/studio',
    )
    check(
      'the row is written last, and it is written',
      (
        db
          .prepare('SELECT lane_name FROM projects WHERE lane_of = ?')
          .get(rootId) as { lane_name: string } | undefined
      )?.lane_name === 'studio',
    )

    // ---- The pre-scan measures the disk, not the archives ----------------
    // `create()` keeps `copiedBytes` to itself, so the observed copy is
    // exercised directly: it is the number the clone budget -- and therefore
    // the amber "bytes" line on the door -- is derived from.
    const observedTarget = join(tempDir, 'observed')
    mkdirSync(observedTarget, { recursive: true })
    const observed = await copyLaneTree(
      rootPath,
      observedTarget,
      process.platform === 'darwin'
        ? makeDarwinCloneCopier()
        : makeByteCopier(),
    )
    const expectedBytes = trueCopiedBytes(rootPath)
    check(
      'the pre-scan sums the bytes on disk, not an archive’s imaginary contents',
      observed.copiedBytes === expectedBytes,
      `scanned ${observed.copiedBytes}, on disk ${expectedBytes}`,
    )

    // ---- A failure after the copy rolls back, and says why ---------------
    // The rollback is the half that lied: `release()`'s own `ENOTEMPTY` used
    // to be thrown over the top of the real cause, so the dialog named a
    // folder inside Electron.app and never the reason.
    const failing = new LaneService(
      db,
      new FailingGitService(),
      () => lanesRoot,
    )

    let thrown: unknown = null
    try {
      await failing.create({
        rootProjectId: rootId,
        laneName: 'doomed',
        branchName: 'feat/doomed',
      })
    } catch (error) {
      thrown = error
    }
    const thrownMessage =
      thrown instanceof Error ? thrown.message : String(thrown)
    check(
      'a failure after the copy shows its CAUSE, not the rollback’s ENOTEMPTY',
      thrownMessage.includes(FORCED_FAILURE),
      `thrown: ${thrownMessage}`,
    )
    check(
      'and the half-made lane folder is gone',
      pathKind(join(lanesRoot, rootId, 'doomed')) === 'absent',
    )
  } finally {
    if (socket)
      await new Promise<void>((resolve) => socket!.close(() => resolve()))
    execFileSync('rm', ['-rf', '--', tempDir])
  }

  console.log(
    failures.length === 0
      ? `LANE CANARY PASSED — ${checked} checks under ${runtime}`
      : `LANE CANARY FAILED — ${failures.length} of ${checked} checks under ${runtime}`,
  )
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((error: unknown) => {
  console.error('LANE CANARY ERRORED —', error)
  process.exit(1)
})
