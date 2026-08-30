import { describe, expect, it } from 'vitest'
import {
  decodeSessionWorkAddress,
  describeCloneableRepository,
  describeRemoteProjectPlace,
  describeWorkAddress,
  parseSessionWorkAddress,
  serializeSessionWorkAddress,
  UNKNOWN_WORK_ADDRESS,
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
