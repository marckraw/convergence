import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { TrackerAdapter } from './tracker.types'

const electronMocks = vi.hoisted(() => ({
  channels: [] as string[],
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string) => {
      electronMocks.channels.push(channel)
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
}))

import {
  registerTrackerIpcHandlers,
  TRACKER_OUTSIDE_UPDATED_CHANNEL,
} from './tracker.ipc'
import {
  registerWorkLedgerIpcHandlers,
  WORK_LEDGER_UPDATED_CHANNEL,
} from '../work-ledger/work-ledger.ipc'

/** Source text with comments removed, so prose may say what code may not. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('MAR-3084 R8: the app never writes to the tracker', () => {
  beforeEach(() => {
    electronMocks.channels.length = 0
  })

  it('the adapter port has exactly the five read methods', () => {
    // Widened twice, on purpose: `resolveProject` asks which project answers
    // to a URL, a name or an id (MAR-3156), and `readIssueBodies` asks for
    // the descriptions of issues that changed (MAR-3190 R4). What this case
    // pins is unchanged -- the SET is exact, so a writing method cannot
    // arrive unnoticed. A third widening (MAR-3236): `listOutsideIssues`
    // reads the project's open issues that carry no Loom label.
    expectTypeOf<keyof TrackerAdapter>().toEqualTypeOf<
      | 'probe'
      | 'listLabeledIssues'
      | 'readIssueBodies'
      | 'resolveProject'
      | 'listOutsideIssues'
    >()
    const source = readFileSync(join(__dirname, 'tracker.types.ts'), 'utf8')
    const port = /export interface TrackerAdapter \{([\s\S]*?)\n\}/.exec(
      withoutComments(source),
    )
    // Mutation: add `updateIssueStatus(...)` to the port -> red here.
    expect(
      [...(port?.[1] ?? '').matchAll(/^\s+(\w+)\(/gm)].map((match) => match[1]),
    ).toEqual([
      'probe',
      'listLabeledIssues',
      'readIssueBodies',
      'resolveProject',
      'listOutsideIssues',
    ])
  })

  it('no shipped file under backend/tracker/ holds a GraphQL mutation outside a comment', () => {
    const offenders = readdirSync(__dirname)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .filter((name) =>
        /\bmutation\b/i.test(
          withoutComments(readFileSync(join(__dirname, name), 'utf8')),
        ),
      )
    expect(offenders).toEqual([])
  })

  it('exposes exactly the read and credential doors', () => {
    registerTrackerIpcHandlers({
      credentials: {
        status: async () => 'absent',
        setKey: async () => 'present',
        deleteKey: async () => 'absent',
      },
      probe: async () => ({ ok: true, issues: 0, projectName: 'convergence' }),
      resolveProject: async () => ({ kind: 'not-found' }),
      crewExists: () => true,
      refresh: () => ({ outcome: 'reading', refreshableAt: null }),
      outside: (crewId) => ({ crewId, issues: [], more: false, readAt: null }),
    })
    registerWorkLedgerIpcHandlers({
      snapshot: (crewId) => ({ crewId, entries: [], trackerHealth: null }),
    })
    expect(electronMocks.channels).toEqual([
      'tracker:probe',
      // A read (MAR-3156 R5): it answers with projects and never a key.
      'tracker:resolveProject',
      // A read asked for sooner (MAR-3227 R6): it moves nothing on the
      // tracker and never returns a key.
      'tracker:refresh',
      // A read of the watcher's memory (MAR-3236): the issues outside the
      // loop, as last read. It asks the tracker nothing.
      'tracker:outside',
      'tracker:credentialStatus',
      'tracker:setCredential',
      'tracker:deleteCredential',
      'workLedger:list',
    ])
    expect(WORK_LEDGER_UPDATED_CHANNEL).toBe('workLedger:updated')
    expect(TRACKER_OUTSIDE_UPDATED_CHANNEL).toBe('tracker:outsideUpdated')
  })
})
