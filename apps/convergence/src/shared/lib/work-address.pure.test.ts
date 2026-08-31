import { describe, expect, it } from 'vitest'
import {
  DAEMON_NAMED_BRANCH_LABEL,
  decodeSessionWorkAddress,
  describeBranchPhrase,
  describeBranchToBeCut,
  describeCloneableRepository,
  describeRemoteProjectPlace,
  describeStatedBranch,
  describeWorkAddress,
  parseSessionWorkAddress,
  serializeSessionWorkAddress,
  statedWorkPlace,
  UNKNOWN_WORK_ADDRESS,
  type ReportedWorkspace,
  type SessionWorkAddress,
} from './work-address.pure'

const PROJECT_ADDRESS: SessionWorkAddress = {
  mode: 'project',
  projectId: 'new-blok',
  workingDirectory: '/srv/projects/new-blok',
  label: 'Project new-blok',
}

const REPOSITORY_ADDRESS: SessionWorkAddress = {
  mode: 'repository',
  repository: 'https://github.com/marckraw/new-blok.git',
  branchName: null,
  label: 'marckraw/new-blok',
}

describe('work address round trip', () => {
  it('carries a Project through the column unchanged', () => {
    expect(
      parseSessionWorkAddress(serializeSessionWorkAddress(PROJECT_ADDRESS)),
    ).toEqual(PROJECT_ADDRESS)
  })

  it('carries a repository through the column unchanged', () => {
    expect(
      parseSessionWorkAddress(serializeSessionWorkAddress(REPOSITORY_ADDRESS)),
    ).toEqual(REPOSITORY_ADDRESS)
  })

  it('carries unknown as the value it is', () => {
    expect(
      parseSessionWorkAddress(
        serializeSessionWorkAddress(UNKNOWN_WORK_ADDRESS),
      ),
    ).toEqual({ mode: 'unknown' })
  })

  it('writes only the fields the mode declares', () => {
    const written = JSON.parse(
      serializeSessionWorkAddress({
        ...PROJECT_ADDRESS,
        // A runtime object can carry more than its type admits; the record is
        // not the place to find that out.
        smuggled: 'token',
      } as SessionWorkAddress),
    ) as Record<string, unknown>
    expect(Object.keys(written).sort()).toEqual([
      'label',
      'mode',
      'projectId',
      'workingDirectory',
    ])
  })
})

describe('parseSessionWorkAddress', () => {
  it('reads a local row, which records no place at all, as nothing', () => {
    expect(parseSessionWorkAddress(null)).toBeNull()
    expect(parseSessionWorkAddress(undefined)).toBeNull()
    expect(parseSessionWorkAddress('   ')).toBeNull()
  })

  it('invents no place from a half-written value', () => {
    expect(parseSessionWorkAddress('{')).toBeNull()
    expect(parseSessionWorkAddress('"repository"')).toBeNull()
    expect(parseSessionWorkAddress('{"mode":"project"}')).toBeNull()
    expect(
      parseSessionWorkAddress('{"mode":"repository","label":"x"}'),
    ).toBeNull()
    expect(parseSessionWorkAddress('{"mode":"elsewhere"}')).toBeNull()
  })
})

describe('describeWorkAddress', () => {
  it('shows the label the strip carried when he pressed send', () => {
    expect(describeWorkAddress(PROJECT_ADDRESS)).toBe('Project new-blok')
    expect(describeWorkAddress(REPOSITORY_ADDRESS)).toBe('marckraw/new-blok')
  })

  it('says Unknown for a pre-era row and for a row with no record', () => {
    expect(describeWorkAddress(UNKNOWN_WORK_ADDRESS)).toBe('Unknown')
    expect(describeWorkAddress(null)).toBe('Unknown')
    expect(describeWorkAddress(undefined)).toBe('Unknown')
  })
})

describe('place labels', () => {
  it('names a repository owner/repo whatever the clone URL looks like', () => {
    expect(
      describeCloneableRepository('https://github.com/marckraw/new-blok.git'),
    ).toBe('marckraw/new-blok')
    expect(
      describeCloneableRepository('https://github.com/marckraw/new-blok'),
    ).toBe('marckraw/new-blok')
  })

  it('names a Project on a machine', () => {
    expect(describeRemoteProjectPlace('new-blok')).toBe('Project new-blok')
  })
})

describe('decodeSessionWorkAddress', () => {
  it('takes a work address the renderer sent, field for field', () => {
    expect(decodeSessionWorkAddress(PROJECT_ADDRESS)).toEqual({
      status: 'decoded',
      address: PROJECT_ADDRESS,
    })
    expect(decodeSessionWorkAddress(REPOSITORY_ADDRESS)).toEqual({
      status: 'decoded',
      address: REPOSITORY_ADDRESS,
    })
  })

  it('reads a missing address as absent, which is what Local sends', () => {
    expect(decodeSessionWorkAddress(undefined)).toEqual({ status: 'absent' })
    expect(decodeSessionWorkAddress(null)).toEqual({ status: 'absent' })
  })

  it('refuses a malformed address by name rather than repairing it', () => {
    // The IPC argument is `unknown` and the bridge says main decodes it. The
    // probe that found this passed `{mode:'repository', repository:42}`: it was
    // written to the record verbatim and read back as no place at all.
    //
    // Mutation: return `{ status: 'absent' }` (or coerce with `String(...)`)
    // instead of `malformed`, and every row here goes red.
    for (const value of [
      { mode: 'repository', repository: 42, label: 'shown' },
      { mode: 'project', projectId: 'p', workingDirectory: 7, label: 'x' },
      { mode: 'somewhere-else' },
      'repository',
      42,
      [],
    ]) {
      const decoded = decodeSessionWorkAddress(value)
      expect(decoded.status).toBe('malformed')
    }
  })

  it('refuses a place stated with nothing in it', () => {
    // "A concrete place or not at all" is not a shape question. An empty clone
    // URL, an empty daemon directory and a blank label all pass
    // `typeof === 'string'`, and each one produces a remote row that names
    // nowhere and shows nothing on the strip (MAR-2689 round 2).
    //
    // Validated, never trimmed: what is kept is the string that was sent, and a
    // value this door had to rewrite to accept is one it should have refused.
    //
    // Mutation: accept any string again (drop `namesAConcreteWorkPlace` from
    // `sessionWorkAddressFromValue`), and every row here goes red.
    for (const value of [
      { mode: 'repository', repository: '', label: 'marckraw/new-blok' },
      { mode: 'repository', repository: '   ', label: 'marckraw/new-blok' },
      {
        mode: 'repository',
        repository: 'https://github.com/marckraw/new-blok.git',
        label: '',
      },
      {
        mode: 'repository',
        repository: 'https://github.com/marckraw/new-blok.git',
        label: ' \t ',
      },
      {
        mode: 'project',
        projectId: '',
        workingDirectory: '/srv/projects/new-blok',
        label: 'Project new-blok',
      },
      {
        mode: 'project',
        projectId: 'new-blok',
        workingDirectory: '  ',
        label: 'Project new-blok',
      },
      {
        mode: 'project',
        projectId: 'new-blok',
        workingDirectory: '/srv/projects/new-blok',
        label: '\n',
      },
    ]) {
      expect(decodeSessionWorkAddress(value).status).toBe('malformed')
    }

    // The column reader is the same allowlist over the other transport, so a
    // row written blank by anything reads back as no place rather than as a
    // place with nothing in it.
    expect(
      parseSessionWorkAddress(
        '{"mode":"repository","repository":"","label":"x"}',
      ),
    ).toBeNull()
  })

  it('reads the shape it refuses back out of its own reason', () => {
    const decoded = decodeSessionWorkAddress({ mode: 'repository' })
    expect(decoded.status === 'malformed' ? decoded.reason : '').toContain(
      'repository',
    )
  })
})

describe('the branch, written down (MAR-2694)', () => {
  const WITH_BRANCH: SessionWorkAddress = {
    ...REPOSITORY_ADDRESS,
    branchName: 'agent/mar-2694',
  }

  it('carries a written branch through the column verbatim', () => {
    expect(
      parseSessionWorkAddress(serializeSessionWorkAddress(WITH_BRANCH)),
    ).toEqual(WITH_BRANCH)
  })

  /**
   * A row written before C2 has no `branchName` key at all, and reads as the
   * thing those sessions actually got: a branch the daemon named.
   *
   * Mutation: refuse an absent `branchName` and this goes red -- every
   * repository row on record would decode to nothing.
   */
  it('reads a row written before the field existed as daemon-named', () => {
    expect(
      parseSessionWorkAddress(
        '{"mode":"repository","repository":"https://github.com/marckraw/new-blok.git","label":"marckraw/new-blok"}',
      ),
    ).toEqual({ ...REPOSITORY_ADDRESS, branchName: null })
  })

  /**
   * Blank is refused, not folded into null. `null` is the strip's *"branch:
   * daemon-named"* -- a claim the human can read and check -- and turning a
   * caller's `'  '` into that claim silently would put a sentence on screen
   * that nobody wrote.
   *
   * Mutation: accept a blank `branchName` as `null` and this goes red.
   */
  it('refuses a branch that says nothing, rather than repairing it', () => {
    for (const branchName of ['', '   ', '\t', 42, {}]) {
      expect(
        decodeSessionWorkAddress({ ...REPOSITORY_ADDRESS, branchName }).status,
      ).toBe('malformed')
    }
    expect(
      decodeSessionWorkAddress({ ...REPOSITORY_ADDRESS, branchName: null }),
    ).toEqual({
      status: 'decoded',
      address: { ...REPOSITORY_ADDRESS, branchName: null },
    })
  })

  it('names the branch in the shape it refuses', () => {
    const decoded = decodeSessionWorkAddress({
      ...REPOSITORY_ADDRESS,
      branchName: '  ',
    })
    expect(decoded.status === 'malformed' ? decoded.reason : '').toContain(
      'branchName',
    )
  })

  it('writes only the fields the repository mode declares', () => {
    expect(
      Object.keys(
        JSON.parse(serializeSessionWorkAddress(WITH_BRANCH)) as object,
      ).sort(),
    ).toEqual(['branchName', 'label', 'mode', 'repository'])
  })

  /**
   * The two readings of the field, and they must not be swappable.
   *
   * Mutation: swap the two return values in `describeBranchToBeCut` and this
   * goes red -- an empty field would then read as though a branch had been
   * chosen.
   */
  it('says what will happen for an empty field and what was written for a full one', () => {
    expect(describeBranchToBeCut(null)).toBe('branch: daemon-named')
    expect(describeBranchToBeCut('agent/mar-2694')).toBe('@ agent/mar-2694')
  })
})

describe('statedWorkPlace (MAR-2694)', () => {
  const REPORTED_ERRAND: ReportedWorkspace = {
    mode: 'repository',
    repository: 'https://github.com/marckraw/new-blok.git',
    branchName: 'agent/34372e47',
    baseRef: 'master',
    workspacePath: '/srv/worktrees/s-1',
    environment: null,
  }

  /**
   * The daemon's answer beats the request, always -- it is the branch that
   * exists. What was asked for survives beside it when the two differ.
   *
   * Mutation: prefer the address's `branchName` over the reported one and this
   * goes red.
   */
  it('states the branch the daemon cut, and what was asked for when they differ', () => {
    expect(
      statedWorkPlace(
        { ...REPOSITORY_ADDRESS, branchName: 'agent/mar-2694' },
        REPORTED_ERRAND,
      ),
    ).toEqual({
      place: 'marckraw/new-blok',
      branchName: 'agent/34372e47',
      requestedBranchName: 'agent/mar-2694',
      namesABranch: true,
    })
  })

  it('says nothing about a request the daemon granted', () => {
    expect(
      statedWorkPlace(
        { ...REPOSITORY_ADDRESS, branchName: 'agent/34372e47' },
        REPORTED_ERRAND,
      ).requestedBranchName,
    ).toBeNull()
  })

  /**
   * Before the daemon answers, an errand with nothing written down says the
   * daemon will name the branch -- never a placeholder, never blank.
   */
  it('says the daemon names the branch for an errand that wrote none', () => {
    const statement = statedWorkPlace(REPOSITORY_ADDRESS, null)
    expect(statement.branchName).toBeNull()
    expect(describeStatedBranch(statement)).toBe('daemon-named')
  })

  /**
   * A residency that has not reported its HEAD names no branch at all. Saying
   * "daemon-named" there would claim a materialisation that never happens: a
   * Project runs on a checkout that already exists.
   *
   * Mutation: make `namesABranch` unconditionally true and this goes red.
   */
  it('names no branch for a Project the daemon has not described yet', () => {
    expect(describeStatedBranch(statedWorkPlace(PROJECT_ADDRESS, null))).toBe(
      null,
    )
  })

  it("reads a residency's actual HEAD and the branch it was asked for", () => {
    const statement = statedWorkPlace(PROJECT_ADDRESS, {
      mode: 'project',
      projectId: 'new-blok',
      workingDirectory: '/srv/projects/new-blok',
      origin: 'https://github.com/marckraw/new-blok.git',
      originKey: 'github.com/marckraw/new-blok',
      branchName: 'master',
      requestedBranchName: 'agent/mar-2694',
      environment: null,
    })
    expect(describeStatedBranch(statement)).toBe('master')
    expect(statement.requestedBranchName).toBe('agent/mar-2694')
  })

  it('says Unknown for a row that recorded no place, without inventing a branch', () => {
    expect(statedWorkPlace(UNKNOWN_WORK_ADDRESS, null)).toEqual({
      place: 'Unknown',
      branchName: null,
      requestedBranchName: null,
      namesABranch: false,
    })
  })
})

describe('describeBranchPhrase', () => {
  /**
   * The one form a branch takes after a place, so the strip and the details
   * panel cannot come to write `@ agent/x` two ways.
   */
  it('reads as an at-phrase after the place', () => {
    expect(describeBranchPhrase('agent/34372e47')).toBe('@ agent/34372e47')
    expect(describeBranchPhrase(DAEMON_NAMED_BRANCH_LABEL)).toBe(
      '@ daemon-named',
    )
  })
})
