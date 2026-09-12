import { describe, expect, it } from 'vitest'
import type { WorkAddressSlotInput } from '@/entities/execution-host'
import { resolveConnectionWorkAddress } from './connection-work-address.pure'

const input: WorkAddressSlotInput = {
  host: { mode: 'choosing', hostId: 'little-monster' },
  hostLabel: 'little-monster',
  matchingProjectId: null,
  projects: { status: 'landed', projects: [], unreachableReason: null },
  localRepository: {
    status: 'known',
    repository: 'https://github.com/marckraw/convergence',
  },
  selectedId: 'project:gone',
  branchDraft: '',
  reportedWorkspace: null,
  recordedAddress: {
    mode: 'project',
    projectId: 'gone',
    workingDirectory: '/old',
    label: 'Project Recorded',
  },
}

describe('resolveConnectionWorkAddress', () => {
  it('keeps an unoffered recorded place as fact (mutation: substitute the catalog default)', () => {
    expect(resolveConnectionWorkAddress(input)).toMatchObject({
      mode: 'settled',
      label: 'Project Recorded',
      notice: 'This recorded place is no longer offered by the endpoint.',
    })
  })
  it('keeps the fact while the catalog is pending (mutation: erase a place during a read)', () => {
    expect(
      resolveConnectionWorkAddress({
        ...input,
        projects: { status: 'pending' },
      }),
    ).toMatchObject({ mode: 'settled', label: 'Project Recorded' })
  })
})

it('keeps an offered recorded Project editable (mutation: settle every recorded address)', () => {
  expect(
    resolveConnectionWorkAddress({
      ...input,
      projects: {
        status: 'landed',
        projects: [
          {
            id: 'gone',
            name: 'Recorded',
            workingDirectory: '/old',
            origin: null,
          },
        ],
        unreachableReason: null,
      },
    }),
  ).toMatchObject({ mode: 'choosing', address: input.recordedAddress })
})

it('keeps a renamed Project selectable by id (mutation: compare by label or working directory)', () => {
  const view = resolveConnectionWorkAddress({
    ...input,
    projects: {
      status: 'landed',
      unreachableReason: null,
      projects: [
        {
          id: 'gone',
          name: 'Renamed',
          workingDirectory: '/new',
          origin: null,
        },
      ],
    },
  })
  expect(view).toMatchObject({
    mode: 'choosing',
    selectedId: 'project:gone',
    notice: 'This recorded place was renamed to Project Renamed.',
    address: {
      mode: 'project',
      projectId: 'gone',
      label: 'Project Renamed',
      workingDirectory: '/new',
    },
    choices: expect.arrayContaining([
      expect.objectContaining({ id: 'project:gone', label: 'Project Renamed' }),
    ]),
  })
})

it('reports a same-id Project moved to another directory (mutation: omit moved notice)', () => {
  expect(
    resolveConnectionWorkAddress({
      ...input,
      projects: {
        status: 'landed',
        unreachableReason: null,
        projects: [
          {
            id: 'gone',
            name: 'Recorded',
            workingDirectory: '/new',
            origin: null,
          },
        ],
      },
    }),
  ).toMatchObject({
    mode: 'choosing',
    notice: 'This recorded place moved to /new.',
  })
})
