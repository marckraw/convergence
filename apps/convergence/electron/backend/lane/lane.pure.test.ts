import { describe, expect, it } from 'vitest'
import {
  CLONE_BUDGET_FRACTION,
  CLONE_BUDGET_MIN_BYTES,
  deriveLaneCopyMethod,
  isLaneCopySkipped,
  laneProjectName,
  parseCreateLaneInput,
  relativeToCopyRoot,
  resolveLaneTargetPath,
  validateLaneName,
} from './lane.pure'

describe('validateLaneName', () => {
  it('accepts lowercase letters, digits and hyphens, trimmed', () => {
    expect(validateLaneName(' studio ')).toBe('studio')
    expect(validateLaneName('run-40')).toBe('run-40')
  })

  it.each(['', 'Studio', 'my lane', 'a/b', 'x'.repeat(41), 'ünï'])(
    'refuses %j',
    (name) => {
      expect(() => validateLaneName(name)).toThrow(/Lane name/)
    },
  )
})

describe('isLaneCopySkipped', () => {
  it("skips the checkout's own build output at any depth outside node_modules", () => {
    expect(isLaneCopySkipped('out')).toBe(true)
    expect(isLaneCopySkipped('apps/convergence/out/main/index.js')).toBe(true)
    expect(isLaneCopySkipped('apps/convergence/release')).toBe(true)
    expect(isLaneCopySkipped('packages/x/dist/index.js')).toBe(true)
  })

  it('keeps ignored files: env, node_modules, gitignored docs', () => {
    expect(isLaneCopySkipped('.env')).toBe(false)
    expect(isLaneCopySkipped('apps/convergence/.env')).toBe(false)
    expect(isLaneCopySkipped('node_modules/react/index.js')).toBe(false)
    expect(isLaneCopySkipped('HANDOFF.md')).toBe(false)
  })

  // H1 (round 2): 173 packages here ship a dist/ or out/, and
  // node_modules/electron/dist IS the Electron binary. A lane that cannot
  // start Electron is not a lane. The skip list stops at node_modules.
  it('never skips anything under node_modules, whatever it is called', () => {
    expect(isLaneCopySkipped('node_modules/x/dist/index.js')).toBe(false)
    expect(
      isLaneCopySkipped(
        'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
      ),
    ).toBe(false)
    expect(isLaneCopySkipped('node_modules/y/out/main.js')).toBe(false)
    expect(isLaneCopySkipped('node_modules/z/release/notes.md')).toBe(false)
    expect(
      isLaneCopySkipped('apps/convergence/node_modules/w/dist/index.js'),
    ).toBe(false)
    // The checkout's own output beside node_modules is still left behind.
    expect(isLaneCopySkipped('apps/convergence/out/main/index.js')).toBe(true)
  })

  it('judges by segment, not by substring', () => {
    expect(isLaneCopySkipped('dist-tools/index.ts')).toBe(false)
    expect(isLaneCopySkipped('outer/file.ts')).toBe(false)
  })

  it("drops git's lock files and the root's worktree metadata, nothing else of .git", () => {
    expect(isLaneCopySkipped('.git/index.lock')).toBe(true)
    // L3 (round 2): every *.lock under .git is a lock git left mid-write,
    // not just the index's.
    expect(isLaneCopySkipped('.git/HEAD.lock')).toBe(true)
    expect(isLaneCopySkipped('.git/packed-refs.lock')).toBe(true)
    expect(isLaneCopySkipped('.git/refs/heads/master.lock')).toBe(true)
    expect(isLaneCopySkipped('.git/config.lock')).toBe(true)
    // A tracked file that merely ends in .lock is not git's.
    expect(isLaneCopySkipped('package-lock.json')).toBe(false)
    expect(isLaneCopySkipped('docs/notes.lock')).toBe(false)
    expect(isLaneCopySkipped('.git/worktrees')).toBe(true)
    expect(isLaneCopySkipped('.git/worktrees/abc/HEAD')).toBe(true)
    expect(isLaneCopySkipped('.git/index')).toBe(false)
    expect(isLaneCopySkipped('.git/config')).toBe(false)
    expect(isLaneCopySkipped('.git/objects/ab/cdef')).toBe(false)
    // A tracked folder that merely shares the name is not git's metadata.
    expect(isLaneCopySkipped('docs/worktrees/index.md')).toBe(false)
  })

  it('never skips the root itself', () => {
    expect(isLaneCopySkipped('')).toBe(false)
  })

  it('honours a custom skip list', () => {
    expect(isLaneCopySkipped('out/x', ['build'])).toBe(false)
    expect(isLaneCopySkipped('build/x', ['build'])).toBe(true)
  })
})

describe('resolveLaneTargetPath', () => {
  it('nests the lane under its root id inside the lanes root', () => {
    expect(resolveLaneTargetPath('/data/lanes', 'root-1', 'studio')).toBe(
      '/data/lanes/root-1/studio',
    )
  })
})

describe('laneProjectName', () => {
  it('reads <root> · lane: <name>', () => {
    expect(laneProjectName('convergence', 'studio')).toBe(
      'convergence · lane: studio',
    )
  })
})

describe('relativeToCopyRoot', () => {
  it('strips the source root, and answers empty for the root itself', () => {
    expect(relativeToCopyRoot('/src/repo', '/src/repo')).toBe('')
    expect(relativeToCopyRoot('/src/repo', '/src/repo/out/a')).toBe('out/a')
    expect(relativeToCopyRoot('/src/repo/', '/src/repo/.env')).toBe('.env')
  })
})

// H1 (round 3): the method is read off the volume -- bytes consumed against
// bytes copied -- never off a flag or an errno.
describe('deriveLaneCopyMethod', () => {
  const MiB = 1024 * 1024

  it('answers clonefile when the copy consumed less than the budget', () => {
    expect(
      deriveLaneCopyMethod({ copiedBytes: 4000 * MiB, consumedBytes: 0 }),
    ).toBe('clonefile')
    // A tenth of four gigabytes is the budget: metadata and noise fit in it.
    expect(
      deriveLaneCopyMethod({
        copiedBytes: 4000 * MiB,
        consumedBytes: 399 * MiB,
      }),
    ).toBe('clonefile')
    // Small trees get the 64 MiB floor, so a few megabytes of metadata never
    // reads as a byte copy.
    expect(
      deriveLaneCopyMethod({ copiedBytes: 10 * MiB, consumedBytes: 3 * MiB }),
    ).toBe('clonefile')
    // Free space that grew during the copy is not a byte copy either.
    expect(
      deriveLaneCopyMethod({ copiedBytes: 10 * MiB, consumedBytes: -5 * MiB }),
    ).toBe('clonefile')
  })

  it('answers bytes when the copy consumed the budget or more', () => {
    expect(
      deriveLaneCopyMethod({
        copiedBytes: 4000 * MiB,
        consumedBytes: 400 * MiB,
      }),
    ).toBe('bytes')
    expect(
      deriveLaneCopyMethod({
        copiedBytes: 4000 * MiB,
        consumedBytes: 3990 * MiB,
      }),
    ).toBe('bytes')
    expect(
      deriveLaneCopyMethod({ copiedBytes: 96 * MiB, consumedBytes: 96 * MiB }),
    ).toBe('bytes')
    expect(
      deriveLaneCopyMethod({
        copiedBytes: 10 * MiB,
        consumedBytes: CLONE_BUDGET_MIN_BYTES,
      }),
    ).toBe('bytes')
  })

  it('pins the budget: max(64 MiB, a tenth of the copied bytes)', () => {
    expect(CLONE_BUDGET_MIN_BYTES).toBe(64 * MiB)
    expect(CLONE_BUDGET_FRACTION).toBe(0.1)
  })
})

// L2 (round 3): the IPC door reads the shape before the service reads the
// fields -- a number where a name should be gets a sentence, not a TypeError.
describe('parseCreateLaneInput', () => {
  const sentence =
    /Lane creation needs a root project id, a lane name and a branch name, each as text\./

  it('passes a well-formed input through as the three strings', () => {
    expect(
      parseCreateLaneInput({
        rootProjectId: 'root',
        laneName: 'studio',
        branchName: 'feat/x',
        extra: 1,
      }),
    ).toEqual({
      rootProjectId: 'root',
      laneName: 'studio',
      branchName: 'feat/x',
    })
  })

  it.each([
    null,
    undefined,
    'studio',
    42,
    {},
    { rootProjectId: 'root', laneName: 'studio' },
    { rootProjectId: 'root', laneName: 5, branchName: 'b' },
    { rootProjectId: ['root'], laneName: 'studio', branchName: 'b' },
    { rootProjectId: 'root', laneName: 'studio', branchName: null },
  ])('refuses %j with one sentence', (raw) => {
    expect(() => parseCreateLaneInput(raw)).toThrow(sentence)
  })
})
