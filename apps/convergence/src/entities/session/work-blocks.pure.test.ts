import { describe, expect, it } from 'vitest'
import type { ConversationItem } from './session.types'
import {
  commonFolder,
  fullDisplayRows,
  groupWorkBlocks,
  parseToolInputPath,
  workBlockLabel,
  workBlockMembership,
  workBlockRole,
  workBlockSummary,
  workDisplayRows,
  workVerbForToolName,
  workSteps,
  type WorkRow,
} from './work-blocks.pure'

let sequence = 0

function base(
  id: string,
  providerId = 'claude-code',
  providerEventType: string | null = null,
) {
  sequence += 1
  return {
    id,
    sessionId: 's',
    sequence,
    turnId: 't',
    state: 'complete' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    providerMeta: { providerId, providerItemId: null, providerEventType },
  }
}

function call(
  id: string,
  toolName: string,
  input: unknown,
  providerId = 'claude-code',
): ConversationItem {
  return {
    ...base(id, providerId, 'tool_use'),
    kind: 'tool-call',
    toolName,
    inputText:
      typeof input === 'string'
        ? input
        : providerId === 'pi'
          ? JSON.stringify(input)
          : JSON.stringify(input, null, 2),
  }
}

function result(
  id: string,
  overrides: Partial<{
    toolName: string | null
    relatedItemId: string | null
    state: 'complete' | 'error'
    providerId: string
    providerEventType: string
  }> = {},
): ConversationItem {
  return {
    ...base(
      id,
      overrides.providerId ?? 'claude-code',
      overrides.providerEventType ?? 'tool_result',
    ),
    kind: 'tool-result',
    toolName: overrides.toolName ?? null,
    relatedItemId: overrides.relatedItemId ?? null,
    outputText: 'out',
    state: overrides.state ?? 'complete',
  }
}

function message(id: string, actor: 'user' | 'assistant'): ConversationItem {
  return { ...base(id), kind: 'message', actor, text: id }
}

function thinking(id: string): ConversationItem {
  return { ...base(id), kind: 'thinking', actor: 'assistant', text: id }
}

function approval(id: string): ConversationItem {
  return { ...base(id), kind: 'approval-request', description: 'allow?' }
}

function inputRequest(id: string): ConversationItem {
  return { ...base(id), kind: 'input-request', prompt: 'which?' }
}

function note(id: string, level: 'info' | 'warning' | 'error' = 'info') {
  return { ...base(id), kind: 'note', level, text: id } as ConversationItem
}

const read = (id: string, path = `/repo/src/${id}.ts`) =>
  call(id, 'Read', { file_path: path })

/** Blocks as `[ids]`, entries as their id: the shape a reader can check. */
function shape(rows: WorkRow<ConversationItem>[]): Array<string | string[]> {
  return rows.map((row) =>
    row.kind === 'block'
      ? row.members.map((member) => member.id)
      : row.entry.id,
  )
}

const fold = (
  items: ConversationItem[],
  marked: ReadonlySet<string> = new Set(),
) =>
  shape(
    groupWorkBlocks(items, (item) => item, {
      isMarked: (item) => marked.has(item.id),
    }),
  )

describe('R1: one rule decides what folds', () => {
  it.each<[string, ConversationItem]>([
    ['assistant message', message('b', 'assistant')],
    ['user message', message('b', 'user')],
    ['approval-request', approval('b')],
    ['input-request', inputRequest('b')],
    ['info note', note('b', 'info')],
    ['warning note', note('b', 'warning')],
    ['error note', note('b', 'error')],
    ['error tool-result', result('b', { state: 'error' })],
    ['error tool-call', { ...read('b'), state: 'error' }],
  ])('%s is a boundary between two runs', (_, boundary) => {
    expect(fold([read('a1'), result('a2'), boundary, read('c1')])).toEqual([
      ['a1', 'a2'],
      'b',
      ['c1'],
    ])
  })

  it('an entry the parallel-work markers speak for is a boundary', () => {
    expect(
      fold([read('a1'), call('b', 'Task', {}), read('c1')], new Set(['b'])),
    ).toEqual([['a1'], 'b', ['c1']])
  })

  it('thinking joins only between two tool items', () => {
    expect(
      fold([
        thinking('lead'),
        read('a1'),
        thinking('mid'),
        read('a2'),
        thinking('tail'),
        message('m', 'assistant'),
      ]),
    ).toEqual(['lead', ['a1', 'mid', 'a2'], 'tail', 'm'])
  })

  it('trailing thinking stays out until the next tool item arrives', () => {
    const items = [read('a1'), thinking('th')]
    expect(fold(items)).toEqual([['a1'], 'th'])
    expect(fold([...items, read('a2')])).toEqual([['a1', 'th', 'a2']])
  })

  it('the role table', () => {
    expect(
      [
        read('x'),
        result('x'),
        thinking('x'),
        message('x', 'assistant'),
        approval('x'),
      ].map((item) => workBlockRole(item)),
    ).toEqual(['tool', 'tool', 'thinking', 'boundary', 'boundary'])
    expect(workBlockRole(read('x'), true)).toBe('boundary')
  })

  it('an entry that draws something above itself starts the next block', () => {
    const rows = groupWorkBlocks(
      [read('a1'), read('a2'), read('b1'), read('b2')],
      (item) => item,
      { startsNewBlock: (item) => item.id === 'b1' },
    )
    expect(shape(rows)).toEqual([
      ['a1', 'a2'],
      ['b1', 'b2'],
    ])
  })

  it('a block is keyed by its first member and keeps the key as it grows', () => {
    const one = groupWorkBlocks([read('a1')], (item) => item)
    const two = groupWorkBlocks([read('a1'), result('a2')], (item) => item)
    expect(
      [one[0], two[0]].map((row) => row?.kind === 'block' && row.id),
    ).toEqual(['a1', 'a1'])
    expect([...workBlockMembership(two, (item) => item)]).toEqual([
      ['a1', 'a1'],
      ['a2', 'a1'],
    ])
  })
})

describe('R2: the label says only facts', () => {
  it('maps tool names to verbs in one table, case-insensitively', () => {
    expect(
      [
        'Read',
        'read',
        'Grep',
        'Glob',
        'Edit',
        'Write',
        'Bash',
        'bash',
        'Task',
        'WebFetch',
      ].map(workVerbForToolName),
    ).toEqual([
      'read',
      'read',
      'search',
      'search',
      'edit',
      'edit',
      'run',
      'run',
      'other',
      'other',
    ])
  })

  it('Claude Code: pretty JSON, results linked to their calls', () => {
    const items = [
      read('r1', '/repo/src/widgets/session-view/a.ts'),
      result('r1r', { relatedItemId: 'r1', toolName: 'Read' }),
      read('r2', '/repo/src/widgets/session-view/b.ts'),
      result('r2r', { relatedItemId: 'r2', toolName: 'Read' }),
      call('g1', 'Grep', { pattern: 'x' }),
      call('g2', 'Glob', { pattern: '*.ts' }),
      call('e1', 'Edit', { file_path: '/repo/src/widgets/session-view/a.ts' }),
      call('b1', 'Bash', { command: 'npm test' }),
    ]
    expect(workBlockLabel(items, { working: false, root: '/repo' })).toBe(
      'Read 2 files in src/widgets/session-view · 2 searches · edited 1 file · ran 1 command',
    )
  })

  it('Pi: compact JSON with `path`, results unlinked', () => {
    const items = [
      call('p1', 'read', { path: 'src/a/x.ts' }, 'pi'),
      result('p1r', {
        providerId: 'pi',
        providerEventType: 'tool_execution_end',
      }),
      call('p2', 'read', { path: 'src/a/y.ts' }, 'pi'),
      result('p2r', {
        providerId: 'pi',
        providerEventType: 'tool_execution_end',
      }),
    ]
    expect(workBlockLabel(items, { working: false })).toBe(
      'Read 2 files in src/a',
    )
  })

  it('Cursor: free text is never a path, and unknown titles are tool calls', () => {
    const items = [
      call('c1', 'Read file', 'src/widgets/a.ts', 'cursor'),
      result('c1r', {
        relatedItemId: 'c1',
        toolName: 'Read file',
        providerId: 'cursor',
      }),
      call('c2', 'Read file', 'src/widgets/b.ts', 'cursor'),
      result('c2r', {
        relatedItemId: 'c2',
        toolName: 'Read file',
        providerId: 'cursor',
      }),
    ]
    expect(workBlockLabel(items, { working: false })).toBe('2 tool calls')
  })

  it('Codex: no calls; command results count as commands', () => {
    const cmd = (id: string, command: string) =>
      result(id, {
        toolName: command,
        providerId: 'codex',
        providerEventType: 'commandExecution',
      })
    const items = [
      cmd('x1', 'ls -la'),
      cmd('x2', 'rg foo src'),
      cmd('x3', 'npm test'),
      result('x4', { providerId: 'codex', providerEventType: 'fileChange' }),
      result('x5', { providerId: 'codex', providerEventType: 'mcpToolCall' }),
    ]
    expect(workBlockLabel(items, { working: false })).toBe(
      '1 edit · ran 3 commands · 1 tool call',
    )
  })

  it('unknown shapes are tool calls; a block of answers says so', () => {
    expect(
      workBlockLabel([call('u1', 'mystery', {}), call('u2', 'enigma', {})], {
        working: false,
      }),
    ).toBe('2 tool calls')
    expect(
      workBlockLabel([result('o1'), result('o2')], { working: false }),
    ).toBe('2 tool results')
  })

  it('the folder is the one EVERY path shares, never the first one’s', () => {
    const items = [
      read('m1', '/repo/src/widgets/session-view/a.ts'),
      read('m2', '/repo/src/entities/session/b.ts'),
    ]
    expect(workBlockLabel(items, { working: false, root: '/repo' })).toBe(
      'Read 2 files in src',
    )
    expect(commonFolder(['/a/b/c.ts', '/x/y.ts'])).toBeNull()
  })

  it('a block whose inputs are not JSON has no folder', () => {
    const items = [
      call('n1', 'Read', '/repo/src/widgets/a.ts'),
      call('n2', 'Read', '/repo/src/widgets/b.ts'),
    ]
    expect(workBlockLabel(items, { working: false })).toBe('2 reads')
    expect(parseToolInputPath('/repo/src/widgets/a.ts')).toBeNull()
    expect(parseToolInputPath('{"notebook_path":"/n.ipynb"}')).toBe('/n.ipynb')
  })

  it('a folder goes only on a verb whose steps ALL carry a path (D3)', () => {
    const searches = [
      call('g1', 'Grep', { pattern: 'x', path: '/repo/src/app/a' }),
      call('g2', 'Grep', { pattern: 'y', path: '/repo/src/app/b' }),
      call('g3', 'Grep', { pattern: 'z' }),
    ]
    expect(workBlockLabel(searches, { working: false, root: '/repo' })).toBe(
      '3 searches',
    )
    expect(
      workBlockLabel(
        [
          ...searches,
          read('g4', '/repo/src/app/a/x.ts'),
          read('g5', '/repo/src/app/b/y.ts'),
        ],
        { working: false, root: '/repo' },
      ),
    ).toBe('Read 2 files in src/app · 3 searches')
  })

  it('one path is not a folder; the same file read twice is one file', () => {
    expect(
      workBlockLabel([read('s1', '/repo/src/a.ts')], { working: false }),
    ).toBe('Read 1 file')
    expect(
      workBlockLabel(
        [read('s1', '/repo/src/a.ts'), read('s2', '/repo/src/a.ts')],
        {
          working: false,
          root: '/repo',
        },
      ),
    ).toBe('Read 1 file in src')
  })

  it('a working block says so before its facts', () => {
    expect(workBlockLabel([read('w1')], { working: true })).toBe(
      'Working… read 1 file',
    )
  })
})

describe('R2: steps and the summary under the label', () => {
  it('a call is a step; a result is a step only when it answers no call and is typed', () => {
    expect(
      workSteps([
        read('s1', '/repo/a.ts'),
        result('s1r', { relatedItemId: 's1', toolName: 'Read' }),
        result('pi', {
          providerId: 'pi',
          providerEventType: 'tool_execution_end',
        }),
        result('cx', {
          toolName: 'npm test',
          providerId: 'codex',
          providerEventType: 'commandExecution',
        }),
      ]),
    ).toEqual([
      { verb: 'read', path: '/repo/a.ts' },
      { verb: 'run', path: null },
    ])
  })

  it('the summary is lower case; the label capitalises it', () => {
    const items = [read('c1', '/r/x.ts')]
    expect([
      workBlockSummary(items),
      workBlockLabel(items, { working: false }),
    ]).toEqual(['read 1 file', 'Read 1 file'])
    expect(
      workBlockSummary(
        [read('l1', '/r/a/x.ts'), read('l2', '/r/a/y.ts')],
        '/r',
      ),
    ).toBe('read 2 files in a')
  })
})

describe('display rows', () => {
  it('an open block hangs its members under its line; a closed one hides them', () => {
    const rows = groupWorkBlocks(
      [message('u', 'user'), read('a1'), read('a2')],
      (item) => item,
    )
    const closed = workDisplayRows(
      rows,
      (item) => item,
      () => false,
    )
    const open = workDisplayRows(
      rows,
      (item) => item,
      () => true,
    )
    expect(closed.map((row) => row.key)).toEqual(['u', 'work-block:a1'])
    expect(open.map((row) => `${row.kind}:${row.key}`)).toEqual([
      'entry:u',
      'block:work-block:a1',
      'member:a1',
      'member:a2',
    ])
  })
})

describe('R8: fewer rows', () => {
  it('1,000 items with 900 tool items in runs of 10: Compact ≤ 200 rows, Full 1,000', () => {
    const items: ConversationItem[] = []
    for (let run = 0; run < 90; run += 1) {
      for (let step = 0; step < 10; step += 1)
        items.push(
          step % 2 === 0
            ? read(`r${run}-${step}`)
            : result(`r${run}-${step}`, {
                relatedItemId: `r${run}-${step - 1}`,
              }),
        )
      items.push(message(`m${run}`, 'assistant'))
    }
    for (let extra = 0; extra < 10; extra += 1)
      items.push(message(`u${extra}`, 'user'))
    expect(items).toHaveLength(1000)

    const compact = workDisplayRows(
      groupWorkBlocks(items, (item) => item),
      (item) => item,
      () => false,
    )
    const full = fullDisplayRows(items, (item) => item)
    expect({ compact: compact.length, full: full.length }).toEqual({
      compact: 190,
      full: 1000,
    })
    expect(compact.length).toBeLessThanOrEqual(200)
  })
})
