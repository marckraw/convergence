import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'fs'
import { mkdir, statfs } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createServer, type Server } from 'net'
import { execFileSync } from 'child_process'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { GitService } from '../git/git.service'
import { GIT_INTEGRATION_TEST_TIMEOUT_MS } from '../git/git-integration-budget'
import {
  LaneService,
  copyLaneTree,
  makeNodeByteCopier,
  reserveLaneFolder,
  type LaneTreeCopier,
} from './lane.service'
import {
  CLONE_BUDGET_MIN_BYTES,
  isLaneCopySkipped,
  resolveLaneTargetPath,
} from './lane.pure'
import type { LaneCreateProgressPhase } from './lane.types'

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
}

/** A root checkout with an `origin`, the way a real project has one. */
function makeRootWithOrigin(tempDir: string): {
  rootPath: string
  originPath: string
} {
  const originPath = join(tempDir, 'origin.git')
  execFileSync('git', ['init', '--bare', originPath])
  const rootPath = join(tempDir, 'root')
  execFileSync('git', ['init', rootPath])
  git(rootPath, ['config', 'user.email', 'test@test.com'])
  git(rootPath, ['config', 'user.name', 'Test'])
  writeFileSync(join(rootPath, 'README.md'), 'root\n')
  writeFileSync(join(rootPath, '.gitignore'), '.env\nout/\nnode_modules/\n')
  git(rootPath, ['add', '.'])
  git(rootPath, ['commit', '-m', 'init'])
  git(rootPath, ['branch', '-M', 'master'])
  git(rootPath, ['remote', 'add', 'origin', originPath])
  git(rootPath, ['push', '-u', 'origin', 'master'])
  return { rootPath, originPath }
}

const MiB = 1024 * 1024
/**
 * Big enough that a byte copy of it is unmistakable on the volume (H1: the
 * budget floor is 64 MiB), small enough to write in a blink.
 */
const BIG_FILE_BYTES = 96 * MiB

/** Free bytes on the volume `path` lives on, the way the service reads them. */
async function freeBytes(path: string): Promise<number> {
  const stats = await statfs(path)
  return stats.bavail * stats.bsize
}

/**
 * Whether the temp volume is APFS: `clonefile(2)` is its primitive, and the
 * artifact canary can only be honest where it exists. Read off `mount`, not
 * off a probe of the primitive under test.
 */
function isApfsVolume(path: string): boolean {
  if (process.platform !== 'darwin') return false
  const device = execFileSync('df', ['-P', path], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .at(-1)
    ?.split(/\s+/)[0]
  if (!device) return false
  const mounts = execFileSync('mount', { encoding: 'utf8' })
  return mounts
    .split('\n')
    .some((line) => line.startsWith(`${device} on `) && line.includes('(apfs'))
}

const TEMP_IS_APFS = isApfsVolume(tmpdir())

/**
 * A copier that carries EVERYTHING -- skip list, FIFO and all, the way
 * `cp -R` does: the prune's foil.
 */
const copyEverything: LaneTreeCopier = async (source, target) => {
  for (const entry of execFileSync('ls', ['-A', source], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)) {
    execFileSync('cp', ['-R', join(source, entry), join(target, entry)])
  }
}

/**
 * The big file lives under `node_modules`: ignored, so the L4 reset leaves it
 * alone, and exactly the kind of file a lane exists to carry for free.
 */
const BIG_FILE = join('node_modules', 'big.bin')

/** `core.fsmonitor`'s socket, by the name git gives it, relative to the root. */
const FSMONITOR_SOCKET = join('.git', 'fsmonitor--daemon.ipc')

/** The sentence the result carries for a socket the lane left behind (M1). */
const FSMONITOR_SOCKET_WARNING = `Left behind: ${FSMONITOR_SOCKET} (a socket — nothing to copy)`

function lanesOf(rootId: string): string[] {
  return (
    getDatabase()
      .prepare('SELECT lane_name FROM projects WHERE lane_of = ?')
      .all(rootId) as { lane_name: string }[]
  ).map((row) => row.lane_name)
}

describe('LaneService', { timeout: GIT_INTEGRATION_TEST_TIMEOUT_MS }, () => {
  let tempDir: string
  let rootPath: string
  let originPath: string
  let lanesRoot: string
  let service: LaneService
  let fsmonitorSocket: Server
  const rootId = 'root-project'

  beforeEach(async () => {
    // Short prefix on purpose: a unix socket path is capped at 104 bytes on
    // darwin, and `<tempDir>/root/.git/fsmonitor--daemon.ipc` below must fit.
    tempDir = mkdtempSync(join(tmpdir(), 'cvg-lane-'))
    ;({ rootPath, originPath } = makeRootWithOrigin(tempDir))
    lanesRoot = join(tempDir, 'lanes')

    // Ignored files are what a lane is FOR; build output is what it leaves.
    writeFileSync(join(rootPath, '.env'), 'SECRET=1\n')
    mkdirSync(join(rootPath, 'node_modules', 'dep', 'dist'), {
      recursive: true,
    })
    writeFileSync(join(rootPath, 'node_modules', 'dep', 'index.js'), '1\n')
    // H1: a package's own dist/ is the package, not our build output.
    writeFileSync(
      join(rootPath, 'node_modules', 'dep', 'dist', 'index.js'),
      '2\n',
    )
    mkdirSync(join(rootPath, 'out'), { recursive: true })
    writeFileSync(join(rootPath, 'out', 'bundle.js'), 'built\n')
    mkdirSync(join(rootPath, '.git', 'worktrees', 'wt'), { recursive: true })
    writeFileSync(join(rootPath, '.git', 'worktrees', 'wt', 'HEAD'), 'x\n')
    writeFileSync(join(rootPath, '.git', 'index.lock'), '')
    // M1 (round 4): what `core.fsmonitor` really leaves in `.git` -- a live
    // LISTENING socket, which git respawns seconds after it is killed. No
    // copier can carry it and none has to: the lane is made without it and
    // the result says so.
    fsmonitorSocket = createServer()
    await new Promise<void>((resolve) =>
      fsmonitorSocket.listen(join(rootPath, FSMONITOR_SOCKET), resolve),
    )

    const db = getDatabase()
    db.prepare(
      `INSERT INTO projects (id, name, repository_path, settings)
       VALUES (?, 'convergence', ?, '{}')`,
    ).run(rootId, rootPath)
    service = new LaneService(db, new GitService(), () => lanesRoot)
  })

  afterEach(async () => {
    closeDatabase()
    resetDatabase()
    await new Promise<void>((resolve) => fsmonitorSocket.close(() => resolve()))
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('makes a lane: folder with ignored files, no build output, the named branch from the base, a row last', async () => {
    const phases: LaneCreateProgressPhase[] = []
    const { lane, copyMethod, warnings } = await service.create(
      { rootProjectId: rootId, laneName: 'studio', branchName: 'feat/studio' },
      (phase) => phases.push(phase),
    )

    const lanePath = join(lanesRoot, rootId, 'studio')
    expect(lane.repositoryPath).toBe(lanePath)
    expect(lane.laneOf).toBe(rootId)
    expect(lane.laneName).toBe('studio')
    expect(lane.name).toBe('convergence · lane: studio')

    // The copy: ignored files INCLUDED, the skip list honoured.
    expect(readFileSync(join(lanePath, '.env'), 'utf8')).toBe('SECRET=1\n')
    expect(existsSync(join(lanePath, 'node_modules', 'dep', 'index.js'))).toBe(
      true,
    )
    // H1: a package's dist/ rides along; the checkout's out/ does not.
    expect(
      existsSync(join(lanePath, 'node_modules', 'dep', 'dist', 'index.js')),
    ).toBe(true)
    expect(existsSync(join(lanePath, 'out'))).toBe(false)
    expect(existsSync(join(lanePath, '.git', 'worktrees'))).toBe(false)
    expect(existsSync(join(lanePath, '.git', 'index.lock'))).toBe(false)
    // M1 (round 4): the live fsmonitor socket neither stops the lane nor
    // comes along -- it is left behind, by name, on the result.
    expect(existsSync(join(lanePath, FSMONITOR_SOCKET))).toBe(false)
    expect(warnings).toEqual([FSMONITOR_SOCKET_WARNING])

    // Its own git, on the named branch, cut from origin/master.
    expect(git(lanePath, ['branch', '--show-current'])).toBe('feat/studio')
    expect(git(lanePath, ['rev-parse', 'HEAD'])).toBe(
      git(rootPath, ['rev-parse', 'origin/master']),
    )
    // And the root is untouched: still on master, still no such branch.
    expect(git(rootPath, ['branch', '--show-current'])).toBe('master')
    expect(git(rootPath, ['branch', '--list', 'feat/studio'])).toBe('')

    // The row, written last, and the beats in order.
    expect(
      getDatabase()
        .prepare('SELECT lane_of, lane_name FROM projects WHERE id = ?')
        .get(lane.id),
    ).toEqual({ lane_of: rootId, lane_name: 'studio' })
    expect(phases).toEqual(['copying', 'preparing-branch', 'recording', 'done'])
    expect(['clonefile', 'bytes']).toContain(copyMethod)
  })

  // H1 (round 3): the artifact, not the flag. On APFS the lane is a clone:
  // the volume gives up (almost) nothing for a file it already holds, and the
  // method is read off that fact.
  it.skipIf(!TEMP_IS_APFS)(
    'clones on APFS: reports clonefile and the volume gives up less than a tenth of the copied bytes',
    async () => {
      writeFileSync(join(rootPath, BIG_FILE), Buffer.alloc(BIG_FILE_BYTES, 7))
      const before = await freeBytes(tempDir)

      const { lane, copyMethod } = await service.create({
        rootProjectId: rootId,
        laneName: 'cloned',
        branchName: 'feat/cloned',
      })

      const consumed = before - (await freeBytes(tempDir))
      expect(copyMethod).toBe('clonefile')
      expect(consumed).toBeLessThan(BIG_FILE_BYTES / 10)
      // And it is a real, independent file: the same bytes, its own inode.
      expect(readFileSync(join(lane.repositoryPath, BIG_FILE)).length).toBe(
        BIG_FILE_BYTES,
      )
    },
  )

  it('reports bytes when the copier really copied: the volume gives up the copied bytes', async () => {
    writeFileSync(join(rootPath, BIG_FILE), Buffer.alloc(BIG_FILE_BYTES, 7))
    const byteCopying = new LaneService(
      getDatabase(),
      new GitService(),
      () => lanesRoot,
      makeNodeByteCopier(),
    )
    const before = await freeBytes(tempDir)

    const { lane, copyMethod } = await byteCopying.create({
      rootProjectId: rootId,
      laneName: 'copied',
      branchName: 'feat/copied',
    })

    const consumed = before - (await freeBytes(tempDir))
    expect(copyMethod).toBe('bytes')
    // L1 (round 4): a tenth of margin, because sibling vitest workers free
    // their own temp dirs on this volume while this one is copying -- the
    // claim is "the volume gave up the copied bytes", not "to the byte".
    expect(consumed).toBeGreaterThanOrEqual(0.9 * BIG_FILE_BYTES)
    expect(readFileSync(join(lane.repositoryPath, BIG_FILE)).length).toBe(
      BIG_FILE_BYTES,
    )
  })

  // M1 (round 4, ruled A by Marcin): a socket is never refused. Every socket
  // the pre-scan meets is left behind and named on the result -- one per
  // socket, wherever it sits, next to the fsmonitor one the fixture plants.
  it('leaves every socket behind and names each one, making the lane anyway', async () => {
    const second: Server = createServer()
    await new Promise<void>((resolve) =>
      second.listen(join(rootPath, 'daemon.sock'), resolve),
    )
    try {
      const { lane, warnings } = await service.create({
        rootProjectId: rootId,
        laneName: 'socketed',
        branchName: 'feat/socketed',
      })

      expect(existsSync(join(lane.repositoryPath, 'daemon.sock'))).toBe(false)
      expect(existsSync(join(lane.repositoryPath, FSMONITOR_SOCKET))).toBe(
        false,
      )
      expect(warnings).toEqual([
        FSMONITOR_SOCKET_WARNING,
        'Left behind: daemon.sock (a socket — nothing to copy)',
      ])
      // The rest of the lane is a lane: the branch is cut, the row is written.
      expect(git(lane.repositoryPath, ['branch', '--show-current'])).toBe(
        'feat/socketed',
      )
      expect(readFileSync(join(lane.repositoryPath, '.env'), 'utf8')).toBe(
        'SECRET=1\n',
      )
      expect(lanesOf(rootId)).toEqual(['socketed'])
    } finally {
      await new Promise<void>((resolve) => second.close(() => resolve()))
    }
  })

  it('adopts an existing origin branch instead of forking a second one', async () => {
    // The fixture's stale lock proves the skip list; the root needs it gone
    // to commit again.
    rmSync(join(rootPath, '.git', 'index.lock'))
    git(rootPath, ['checkout', '-b', 'feat/underway'])
    writeFileSync(join(rootPath, 'WORK.md'), 'underway\n')
    git(rootPath, ['add', 'WORK.md'])
    git(rootPath, ['commit', '-m', 'underway'])
    git(rootPath, ['push', '-u', 'origin', 'feat/underway'])
    const underwayTip = git(rootPath, ['rev-parse', 'HEAD'])
    git(rootPath, ['checkout', 'master'])

    const { lane } = await service.create({
      rootProjectId: rootId,
      laneName: 'adopt',
      branchName: 'feat/underway',
    })

    expect(git(lane.repositoryPath, ['branch', '--show-current'])).toBe(
      'feat/underway',
    )
    expect(git(lane.repositoryPath, ['rev-parse', 'HEAD'])).toBe(underwayTip)
  })

  // M2 (round 3): a branch that exists only in the root is adopted as it
  // stands, never reset to the base by `-B`.
  it('adopts a branch that exists only locally in the root, at its own tip', async () => {
    rmSync(join(rootPath, '.git', 'index.lock'))
    git(rootPath, ['checkout', '-b', 'feat/local-only'])
    for (const n of [1, 2]) {
      writeFileSync(join(rootPath, `LOCAL-${n}.md`), `local ${n}\n`)
      git(rootPath, ['add', `LOCAL-${n}.md`])
      git(rootPath, ['commit', '-m', `local ${n}`])
    }
    const localTip = git(rootPath, ['rev-parse', 'HEAD'])
    git(rootPath, ['checkout', 'master'])
    expect(
      git(rootPath, ['branch', '-r', '--list', 'origin/feat/local-only']),
    ).toBe('')

    const { lane } = await service.create({
      rootProjectId: rootId,
      laneName: 'local',
      branchName: 'feat/local-only',
    })

    expect(git(lane.repositoryPath, ['branch', '--show-current'])).toBe(
      'feat/local-only',
    )
    expect(git(lane.repositoryPath, ['rev-parse', 'HEAD'])).toBe(localTip)
    expect(existsSync(join(lane.repositoryPath, 'LOCAL-2.md'))).toBe(true)
    // The root's copy of the branch is untouched too.
    expect(git(rootPath, ['rev-parse', 'feat/local-only'])).toBe(localTip)
    expect(git(rootPath, ['branch', '--show-current'])).toBe('master')
  })

  // M2 (round 4): when BOTH sides of the branch exist, the lane adopts the
  // tip that CONTAINS the other -- so unpushed commits are never reset away
  // by a `-B` from origin, and a stale local never wins over origin.
  describe('adoption when the branch exists on both sides', () => {
    /** A commit on `branchName` whose file is named after the message. */
    function commitFile(name: string): string {
      writeFileSync(join(rootPath, name), `${name}\n`)
      git(rootPath, ['add', name])
      git(rootPath, ['commit', '-m', name])
      return git(rootPath, ['rev-parse', 'HEAD'])
    }

    beforeEach(() => {
      // The fixture's stale lock proves the skip list; committing needs it gone.
      rmSync(join(rootPath, '.git', 'index.lock'))
    })

    it('takes the root when its branch is ahead of origin, keeping the unpushed commit', async () => {
      git(rootPath, ['checkout', '-b', 'feat/ahead'])
      const originTip = commitFile('PUSHED.md')
      git(rootPath, ['push', '-u', 'origin', 'feat/ahead'])
      const localTip = commitFile('UNPUSHED.md')
      git(rootPath, ['checkout', 'master'])

      const { lane, warnings } = await service.create({
        rootProjectId: rootId,
        laneName: 'ahead',
        branchName: 'feat/ahead',
      })

      expect(git(lane.repositoryPath, ['branch', '--show-current'])).toBe(
        'feat/ahead',
      )
      expect(git(lane.repositoryPath, ['rev-parse', 'HEAD'])).toBe(localTip)
      expect(existsSync(join(lane.repositoryPath, 'UNPUSHED.md'))).toBe(true)
      expect(git(lane.repositoryPath, ['rev-parse', 'origin/feat/ahead'])).toBe(
        originTip,
      )
      // Nothing diverged, so nothing to say about it.
      expect(warnings).toEqual([FSMONITOR_SOCKET_WARNING])
      expect(git(rootPath, ['rev-parse', 'feat/ahead'])).toBe(localTip)
    })

    it('takes origin when it contains the root, whose branch was left behind', async () => {
      git(rootPath, ['checkout', '-b', 'feat/behind'])
      const behindTip = commitFile('FIRST.md')
      git(rootPath, ['push', '-u', 'origin', 'feat/behind'])
      const originTip = commitFile('SECOND.md')
      git(rootPath, ['push', 'origin', 'feat/behind'])
      git(rootPath, ['checkout', 'master'])
      // The root's own branch stays a commit behind what it pushed.
      git(rootPath, ['branch', '-f', 'feat/behind', behindTip])

      const { lane, warnings } = await service.create({
        rootProjectId: rootId,
        laneName: 'behind',
        branchName: 'feat/behind',
      })

      expect(git(lane.repositoryPath, ['rev-parse', 'HEAD'])).toBe(originTip)
      expect(existsSync(join(lane.repositoryPath, 'SECOND.md'))).toBe(true)
      expect(warnings).toEqual([FSMONITOR_SOCKET_WARNING])
      expect(git(rootPath, ['rev-parse', 'feat/behind'])).toBe(behindTip)
    })

    it('takes the root when the two have diverged, and says so', async () => {
      git(rootPath, ['checkout', '-b', 'feat/diverged'])
      const sharedTip = commitFile('SHARED.md')
      git(rootPath, ['push', '-u', 'origin', 'feat/diverged'])
      commitFile('ORIGIN-ONLY.md')
      git(rootPath, ['push', 'origin', 'feat/diverged'])
      git(rootPath, ['reset', '--hard', sharedTip])
      const localTip = commitFile('LOCAL-ONLY.md')
      git(rootPath, ['checkout', 'master'])

      const { lane, warnings } = await service.create({
        rootProjectId: rootId,
        laneName: 'diverged',
        branchName: 'feat/diverged',
      })

      expect(git(lane.repositoryPath, ['rev-parse', 'HEAD'])).toBe(localTip)
      expect(existsSync(join(lane.repositoryPath, 'LOCAL-ONLY.md'))).toBe(true)
      expect(existsSync(join(lane.repositoryPath, 'ORIGIN-ONLY.md'))).toBe(
        false,
      )
      expect(warnings).toEqual([
        FSMONITOR_SOCKET_WARNING,
        "origin/feat/diverged and the root's feat/diverged have diverged; the lane took the root's.",
      ])
    })
  })

  it('removes the folder and writes no row when the branch cannot be prepared', async () => {
    getDatabase()
      .prepare('UPDATE projects SET settings = ? WHERE id = ?')
      .run(
        JSON.stringify({
          workspaceCreation: {
            startStrategy: 'base-branch',
            baseBranchName: 'no-such-base',
          },
        }),
        rootId,
      )

    await expect(
      service.create({
        rootProjectId: rootId,
        laneName: 'broken',
        branchName: 'feat/broken',
      }),
    ).rejects.toThrow(/Base branch not found/)

    expect(existsSync(join(lanesRoot, rootId, 'broken'))).toBe(false)
    // L9: the rollback takes the empty <lanesRoot>/<rootId>/ with it.
    expect(existsSync(join(lanesRoot, rootId))).toBe(false)
    expect(
      getDatabase()
        .prepare('SELECT COUNT(*) AS n FROM projects WHERE lane_of = ?')
        .get(rootId),
    ).toEqual({ n: 0 })
  })

  it('removes the folder and writes no row when the copy itself fails', async () => {
    const failing = new LaneService(
      getDatabase(),
      new GitService(),
      () => lanesRoot,
      async (_source, target) => {
        mkdirSync(target, { recursive: true })
        writeFileSync(join(target, 'half.txt'), 'half')
        throw new Error('disk full')
      },
    )

    await expect(
      failing.create({
        rootProjectId: rootId,
        laneName: 'half',
        branchName: 'feat/half',
      }),
    ).rejects.toThrow('disk full')

    expect(existsSync(join(lanesRoot, rootId, 'half'))).toBe(false)
    expect(existsSync(join(lanesRoot, rootId))).toBe(false)
    expect(lanesOf(rootId)).toEqual([])
  })

  it('refuses a bad name, a taken name, a lane of a lane, and an occupied folder', async () => {
    await expect(
      service.create({
        rootProjectId: rootId,
        laneName: 'Studio',
        branchName: 'b',
      }),
    ).rejects.toThrow(/Lane name/)

    const { lane } = await service.create({
      rootProjectId: rootId,
      laneName: 'studio',
      branchName: 'feat/studio',
    })
    await expect(
      service.create({
        rootProjectId: rootId,
        laneName: 'studio',
        branchName: 'other',
      }),
    ).rejects.toThrow(/already exists/)
    await expect(
      service.create({
        rootProjectId: lane.id,
        laneName: 'deeper',
        branchName: 'b',
      }),
    ).rejects.toThrow(/root project/)

    mkdirSync(join(lanesRoot, rootId, 'occupied'), { recursive: true })
    await expect(
      service.create({
        rootProjectId: rootId,
        laneName: 'occupied',
        branchName: 'b',
      }),
    ).rejects.toThrow(/Lane folder already exists/)

    expect(lanesOf(rootId)).toEqual(['studio'])
  })

  // L7: the refusal by record, not by folder -- a row already claims the path.
  it('refuses a target path that a project row already claims', async () => {
    const claimed = resolveLaneTargetPath(lanesRoot, rootId, 'claimed')
    getDatabase()
      .prepare(
        `INSERT INTO projects (id, name, repository_path, settings)
         VALUES ('other', 'other', ?, '{}')`,
      )
      .run(claimed)

    await expect(
      service.create({
        rootProjectId: rootId,
        laneName: 'claimed',
        branchName: 'b',
      }),
    ).rejects.toThrow(/A project already lives at/)
    expect(existsSync(claimed)).toBe(false)
    expect(existsSync(join(lanesRoot, rootId))).toBe(false)
  })

  // M1: two windows, one name. The folder is the lock: a non-recursive mkdir
  // hands it to exactly one caller, and the loser's rollback cannot touch it.
  it('lets exactly one of two simultaneous creations of the same lane win, and the loser leaves the winner alone', async () => {
    const results = await Promise.allSettled([
      service.create({
        rootProjectId: rootId,
        laneName: 'race',
        branchName: 'a',
      }),
      service.create({
        rootProjectId: rootId,
        laneName: 'race',
        branchName: 'b',
      }),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(
      /already exists/,
    )

    const lanePath = join(lanesRoot, rootId, 'race')
    expect(readFileSync(join(lanePath, 'README.md'), 'utf8')).toBe('root\n')
    expect(readFileSync(join(lanePath, '.env'), 'utf8')).toBe('SECRET=1\n')
    expect(lanesOf(rootId)).toEqual(['race'])
  })

  // M2: a lanes root inside the project copies the project into itself
  // (through a symlink, forever); a project inside the lanes root is the
  // same knot from the other side. Both refused before anything is made.
  describe('containment', () => {
    it('refuses a lanes root inside the project, and makes nothing', async () => {
      const inside = new LaneService(getDatabase(), new GitService(), () =>
        join(rootPath, 'lanes'),
      )
      await expect(
        inside.create({
          rootProjectId: rootId,
          laneName: 'x',
          branchName: 'b',
        }),
      ).rejects.toThrow(/inside the project/)
      expect(existsSync(join(rootPath, 'lanes'))).toBe(false)
      expect(lanesOf(rootId)).toEqual([])
    })

    it('sees through a symlinked lanes root that points into the project', async () => {
      mkdirSync(join(rootPath, 'lanes-real'))
      symlinkSync(join(rootPath, 'lanes-real'), join(tempDir, 'lanes-link'))
      const linked = new LaneService(getDatabase(), new GitService(), () =>
        join(tempDir, 'lanes-link'),
      )
      await expect(
        linked.create({
          rootProjectId: rootId,
          laneName: 'x',
          branchName: 'b',
        }),
      ).rejects.toThrow(/inside the project/)
      expect(existsSync(join(rootPath, 'lanes-real', rootId))).toBe(false)
    })

    it('refuses a project inside the lanes root', async () => {
      const around = new LaneService(
        getDatabase(),
        new GitService(),
        () => tempDir,
      )
      await expect(
        around.create({
          rootProjectId: rootId,
          laneName: 'x',
          branchName: 'b',
        }),
      ).rejects.toThrow(/inside the lanes root/)
      expect(existsSync(join(tempDir, rootId))).toBe(false)
    })
  })

  // M3: a linked worktree's .git is a FILE naming another checkout's gitdir;
  // a checkout -B in its copy would move THAT checkout's HEAD.
  it('refuses a root that is a linked worktree, and leaves its main checkout alone', async () => {
    rmSync(join(rootPath, '.git', 'index.lock'))
    const worktreePath = join(tempDir, 'linked')
    git(rootPath, ['worktree', 'add', worktreePath, '-b', 'wt-branch'])
    getDatabase()
      .prepare(
        `INSERT INTO projects (id, name, repository_path, settings)
         VALUES ('linked', 'linked', ?, '{}')`,
      )
      .run(worktreePath)

    await expect(
      service.create({
        rootProjectId: 'linked',
        laneName: 'x',
        branchName: 'feat/from-worktree',
      }),
    ).rejects.toThrow(/linked worktree/)
    expect(existsSync(join(lanesRoot, 'linked'))).toBe(false)
    expect(git(rootPath, ['branch', '--show-current'])).toBe('master')
    expect(git(worktreePath, ['branch', '--show-current'])).toBe('wt-branch')
  })

  // M1 (round 3): the same door with a second key -- a `.git` that is a
  // symlink to another checkout's git directory. Followed, it looks like a
  // directory; copied verbatim, the lane's checkout would move the holder.
  it('refuses a root whose .git is a symlink to another checkout, and leaves the holder alone', async () => {
    rmSync(join(rootPath, '.git', 'index.lock'))
    const holderTip = git(rootPath, ['rev-parse', 'HEAD'])
    const aliasPath = join(tempDir, 'alias')
    mkdirSync(aliasPath)
    writeFileSync(join(aliasPath, 'README.md'), 'root\n')
    symlinkSync(join(rootPath, '.git'), join(aliasPath, '.git'))
    getDatabase()
      .prepare(
        `INSERT INTO projects (id, name, repository_path, settings)
         VALUES ('alias', 'alias', ?, '{}')`,
      )
      .run(aliasPath)

    await expect(
      service.create({
        rootProjectId: 'alias',
        laneName: 'x',
        branchName: 'feat/from-alias',
      }),
    ).rejects.toThrow(/linked worktree/)
    expect(existsSync(join(lanesRoot, 'alias'))).toBe(false)
    expect(git(rootPath, ['branch', '--show-current'])).toBe('master')
    expect(git(rootPath, ['rev-parse', 'HEAD'])).toBe(holderTip)
    expect(git(rootPath, ['branch', '--list', 'feat/from-alias'])).toBe('')
  })

  // L1 (round 3): a sibling's release() may rmdir the shared
  // <lanesRoot>/<rootId>/ between this reserve's two mkdirs; the pair is
  // retried once rather than surfacing a raw ENOENT.
  it('reserves the folder even when the parent vanishes between the two mkdirs', async () => {
    const targetPath = join(lanesRoot, rootId, 'retried')
    let vanished = false
    const calls: string[] = []
    const flakyMkdir: typeof mkdir = (async (path: string, options) => {
      calls.push(String(path))
      if (String(path) === targetPath && !vanished) {
        vanished = true
        throw Object.assign(new Error('parent gone'), { code: 'ENOENT' })
      }
      return mkdir(path, options)
    }) as typeof mkdir

    await reserveLaneFolder(targetPath, flakyMkdir)

    expect(existsSync(targetPath)).toBe(true)
    expect(calls).toEqual([
      join(lanesRoot, rootId),
      targetPath,
      join(lanesRoot, rootId),
      targetPath,
    ])
  })

  it('gives up on a second ENOENT, and on EEXIST at once', async () => {
    const targetPath = join(lanesRoot, rootId, 'unlucky')
    const alwaysGone: typeof mkdir = (async (path: string, options) => {
      if (String(path) === targetPath) {
        throw Object.assign(new Error('parent gone'), { code: 'ENOENT' })
      }
      return mkdir(path, options)
    }) as typeof mkdir
    await expect(reserveLaneFolder(targetPath, alwaysGone)).rejects.toThrow(
      'parent gone',
    )

    mkdirSync(targetPath, { recursive: true })
    await expect(reserveLaneFolder(targetPath)).rejects.toThrow(
      /Lane folder already exists/,
    )
  })

  // L1: git's own answer on the name, asked of the root, before the copy.
  it('refuses a branch name git would refuse, before copying anything', async () => {
    let copies = 0
    const counting = new LaneService(
      getDatabase(),
      new GitService(),
      () => lanesRoot,
      async () => {
        copies += 1
      },
    )
    await expect(
      counting.create({
        rootProjectId: rootId,
        laneName: 'badbranch',
        branchName: 'bad..name',
      }),
    ).rejects.toThrow(/bad\.\.name/)
    expect(copies).toBe(0)
    expect(existsSync(join(lanesRoot, rootId))).toBe(false)
  })

  // L2: offline. The copied .git already carries origin/*; an unreachable
  // origin is a note on the result, not a rollback.
  it('still makes the lane when origin cannot be fetched, and says so', async () => {
    rmSync(originPath, { recursive: true, force: true })
    // The socket is another test's subject; here the only warning in question
    // is the fetch.
    rmSync(join(rootPath, FSMONITOR_SOCKET))

    const { lane, warnings } = await service.create({
      rootProjectId: rootId,
      laneName: 'offline',
      branchName: 'feat/offline',
    })

    expect(git(lane.repositoryPath, ['branch', '--show-current'])).toBe(
      'feat/offline',
    )
    expect(git(lane.repositoryPath, ['rev-parse', 'HEAD'])).toBe(
      git(rootPath, ['rev-parse', 'origin/master']),
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/could not fetch origin/i)
  })

  it('reports no warnings when origin answers', async () => {
    rmSync(join(rootPath, FSMONITOR_SOCKET))
    const { warnings } = await service.create({
      rootProjectId: rootId,
      laneName: 'online',
      branchName: 'feat/online',
    })
    expect(warnings).toEqual([])
  })

  // L4: the root's uncommitted edits are the root's. A lane starts at HEAD,
  // with its ignored files (the point of the copy) untouched.
  it('starts a lane at HEAD even when the root is dirty, keeping ignored files', async () => {
    rmSync(join(rootPath, '.git', 'index.lock'))
    writeFileSync(join(rootPath, 'README.md'), 'edited, not committed\n')
    writeFileSync(join(rootPath, 'scratch.txt'), 'untracked\n')
    writeFileSync(join(rootPath, 'staged.txt'), 'staged\n')
    git(rootPath, ['add', 'staged.txt'])

    const { lane } = await service.create({
      rootProjectId: rootId,
      laneName: 'clean',
      branchName: 'feat/clean',
    })

    expect(readFileSync(join(lane.repositoryPath, 'README.md'), 'utf8')).toBe(
      'root\n',
    )
    expect(existsSync(join(lane.repositoryPath, 'scratch.txt'))).toBe(false)
    expect(existsSync(join(lane.repositoryPath, 'staged.txt'))).toBe(false)
    expect(readFileSync(join(lane.repositoryPath, '.env'), 'utf8')).toBe(
      'SECRET=1\n',
    )
    expect(
      existsSync(join(lane.repositoryPath, 'node_modules', 'dep', 'index.js')),
    ).toBe(true)
    expect(git(lane.repositoryPath, ['status', '--porcelain'])).toBe('')
    // The root keeps its dirt.
    expect(readFileSync(join(rootPath, 'README.md'), 'utf8')).toBe(
      'edited, not committed\n',
    )
    expect(existsSync(join(rootPath, 'scratch.txt'))).toBe(true)
    expect(git(rootPath, ['status', '--porcelain'])).not.toBe('')
  })

  // H1 (round 3): the observed copy -- pre-scan, primitive, prune, method by
  // bytes -- with the primitive injected, so what is pinned is the wrapper.
  describe('copyLaneTree', () => {
    it('prunes the skip list and non-copyable entries from whatever the primitive carried', async () => {
      const target = join(tempDir, 'pruned')
      mkdirSync(target)
      // The prune's foil: `cp -R` RECREATES a FIFO (a socket it skips), so
      // only the prune can take this one back out.
      execFileSync('mkfifo', [join(rootPath, '.git', 'legacy.pipe')])

      const { copyMethod, copiedBytes } = await copyLaneTree(
        rootPath,
        target,
        copyEverything,
      )

      expect(existsSync(join(target, '.git', 'legacy.pipe'))).toBe(false)

      expect(readFileSync(join(target, '.env'), 'utf8')).toBe('SECRET=1\n')
      expect(
        existsSync(join(target, 'node_modules', 'dep', 'dist', 'index.js')),
      ).toBe(true)
      expect(existsSync(join(target, 'out'))).toBe(false)
      expect(existsSync(join(target, '.git', 'worktrees'))).toBe(false)
      expect(existsSync(join(target, '.git', 'index.lock'))).toBe(false)
      expect(existsSync(join(target, '.git', 'fsmonitor--daemon.ipc'))).toBe(
        false,
      )
      // A fixture this small consumes nothing worth the name either way.
      expect(copyMethod).toBe('clonefile')
      // Skipped entries are not counted: `out/bundle.js` is 6 bytes and absent.
      expect(copiedBytes).toBeGreaterThan(0)
    })

    it('never asks the primitive to copy a skipped top-level entry', async () => {
      const target = join(tempDir, 'top')
      mkdirSync(target)
      const asked: string[] = []
      await copyLaneTree(rootPath, target, async (source, dest, shouldSkip) => {
        for (const entry of ['out', 'README.md']) {
          asked.push(`${entry}:${shouldSkip(entry)}`)
        }
        await copyEverything(source, dest, shouldSkip)
      })
      expect(asked).toEqual(['out:true', 'README.md:false'])
    })

    // H1 (round 4): the pre-scan's sum is the SUM. Every file is lstat'd in
    // one fan-out, and a total that loses all but the last update collapses
    // the clone budget to its floor without a word.
    it('counts the exact bytes of every file it keeps, however many are walked at once', async () => {
      const source = join(tempDir, 'sum-source')
      const target = join(tempDir, 'sum-target')
      mkdirSync(join(source, 'nested', 'deep'), { recursive: true })
      mkdirSync(join(source, 'out'), { recursive: true })
      mkdirSync(target)
      let expected = 0
      const write = (path: string, size: number): void => {
        writeFileSync(path, Buffer.alloc(size, 1))
        expected += size
      }
      // Two hundred siblings: one `readdir`, one fan-out, one shared total.
      for (let n = 0; n < 200; n += 1) {
        write(join(source, `f-${n}.bin`), 100 + n)
      }
      write(join(source, 'nested', 'a.bin'), 3000)
      write(join(source, 'nested', 'deep', 'b.bin'), 4000)
      // Skipped bytes are nobody's: `out/` is never copied, never counted.
      writeFileSync(join(source, 'out', 'bundle.js'), Buffer.alloc(8192, 2))

      const { copiedBytes } = await copyLaneTree(source, target, async () => {})

      expect(copiedBytes).toBe(expected)
      expect(expected).toBeGreaterThan(20000)
    })

    // H1 (round 4): and the sum is what the budget is a tenth of. Sparse
    // files give a true apparent size of 2 000 MiB for no disk at all, and
    // the volume reading is injected, so the only variable is the sum: a copy
    // that consumed 96 MiB is a clone under a 200 MiB budget -- and would be
    // "bytes" under the 64 MiB floor a collapsed sum leaves behind.
    it('takes the clone budget from the true sum, not from the floor', async () => {
      const source = join(tempDir, 'sparse-source')
      const target = join(tempDir, 'sparse-target')
      mkdirSync(source)
      mkdirSync(target)
      const SPARSE_FILES = 20
      const SPARSE_FILE_BYTES = 100 * MiB
      for (let n = 0; n < SPARSE_FILES; n += 1) {
        const path = join(source, `sparse-${n}.bin`)
        writeFileSync(path, '')
        truncateSync(path, SPARSE_FILE_BYTES)
      }
      const consumed = 96 * MiB
      const freeReadings = [500 * 1024 * MiB, 500 * 1024 * MiB - consumed]
      const readFreeBytes = async (): Promise<number> => freeReadings.shift()!

      const observed = await copyLaneTree(
        source,
        target,
        async () => {},
        isLaneCopySkipped,
        readFreeBytes,
      )

      expect(observed.copiedBytes).toBe(SPARSE_FILES * SPARSE_FILE_BYTES)
      expect(observed.consumedBytes).toBe(consumed)
      // Above the 64 MiB floor, below a tenth of 2 000 MiB.
      expect(consumed).toBeGreaterThan(CLONE_BUDGET_MIN_BYTES)
      expect(observed.copyMethod).toBe('clonefile')
    })

    it("rethrows the primitive's failure untouched", async () => {
      const target = join(tempDir, 'full')
      mkdirSync(target)
      const diskFull: LaneTreeCopier = async () => {
        throw Object.assign(new Error('no space'), { code: 'ENOSPC' })
      }
      await expect(copyLaneTree(rootPath, target, diskFull)).rejects.toThrow(
        'no space',
      )
    })
  })
})
