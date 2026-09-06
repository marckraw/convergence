import { describe, expect, it } from 'vitest'
import {
  collectDescendantPids,
  parseProcessTable,
  CODEX_RESIDENT_SERVER_MIN_VERSION,
  buildCodexReadyUrl,
  buildCodexServerObituary,
  buildCodexVersionRefusal,
  codexServerKey,
  isCodexThreadUnmaterializedError,
  parseCodexListeningUrl,
  readLandedTurn,
  readCodexUnsubscribeStatus,
  supportsResidentCodexServer,
  threadContainsClientMessage,
} from './codex-server-host.pure'

describe('parseCodexListeningUrl', () => {
  it('reads the port out of the banner codex-cli 0.153.4 actually prints', () => {
    const stderr = [
      'codex app-server (WebSockets)',
      '  listening on: ws://127.0.0.1:61988',
      '  readyz: http://127.0.0.1:61988/readyz',
      '  healthz: http://127.0.0.1:61988/healthz',
      '  note: binds localhost only (use SSH port-forwarding for remote access)',
    ].join('\n')

    expect(parseCodexListeningUrl(stderr)).toBe('ws://127.0.0.1:61988')
  })

  it('is null until the line has arrived in full', () => {
    expect(parseCodexListeningUrl('codex app-server (WebSockets)\n')).toBeNull()
  })

  it('refuses a chunk that ends inside the port', () => {
    // stderr arrives in chunks the writer never chose. `ws://127.0.0.1:5` is a
    // well-formed URL and the wrong server: the host commits to the first
    // address it is handed and never re-reads, so half a port becomes a
    // permanent "never became ready" (MAR-2823 F8).
    expect(
      parseCodexListeningUrl(
        'codex app-server (WebSockets)\n  listening on: ws://127.0.0.1:5',
      ),
    ).toBeNull()
    expect(
      parseCodexListeningUrl(
        'codex app-server (WebSockets)\n  listening on: ws://127.0.0.1:5150\n  readyz: http://127.0.0.1:5150/readyz\n',
      ),
    ).toBe('ws://127.0.0.1:5150')
  })

  it('does not carry trailing punctuation into the URL', () => {
    expect(parseCodexListeningUrl('listening on: ws://127.0.0.1:5.\n')).toBe(
      'ws://127.0.0.1:5',
    )
  })
})

describe('buildCodexReadyUrl', () => {
  it('probes the same port over plain http', () => {
    expect(buildCodexReadyUrl('ws://127.0.0.1:61988')).toBe(
      'http://127.0.0.1:61988/readyz',
    )
  })

  it('refuses an address that is not a websocket listener', () => {
    expect(buildCodexReadyUrl('http://127.0.0.1:61988')).toBeNull()
    expect(buildCodexReadyUrl('not a url')).toBeNull()
  })
})

describe('codexServerKey', () => {
  it('separates accounts, because two homes can never share a process', () => {
    const first = codexServerKey({
      executionHostId: 'local',
      codexHome: '/homes/a',
    })
    const second = codexServerKey({
      executionHostId: 'local',
      codexHome: '/homes/b',
    })
    expect(first).not.toBe(second)
  })

  it('separates execution hosts', () => {
    expect(
      codexServerKey({ executionHostId: 'local', codexHome: '/homes/a' }),
    ).not.toBe(
      codexServerKey({ executionHostId: 'remote-1', codexHome: '/homes/a' }),
    )
  })

  it('gives the ambient login one stable key', () => {
    expect(codexServerKey({ executionHostId: null, codexHome: null })).toBe(
      codexServerKey({ executionHostId: undefined, codexHome: '  ' }),
    )
  })
})

describe('supportsResidentCodexServer', () => {
  it('accepts the measured binary and refuses the per-turn-spawn era', () => {
    expect(supportsResidentCodexServer('codex-cli 0.153.4')).toBe(true)
    expect(supportsResidentCodexServer(CODEX_RESIDENT_SERVER_MIN_VERSION)).toBe(
      true,
    )
    expect(supportsResidentCodexServer('0.152.9')).toBe(false)
    expect(supportsResidentCodexServer('codex-cli 0.142.0')).toBe(false)
  })

  it('treats an unreadable version as supported, leaving the refusal to /readyz', () => {
    expect(supportsResidentCodexServer(null)).toBe(true)
    expect(supportsResidentCodexServer('')).toBe(true)
    expect(supportsResidentCodexServer('nightly')).toBe(true)
  })

  it('names the minimum version in the refusal so the user can act on it', () => {
    expect(buildCodexVersionRefusal('0.142.0')).toContain('0.142.0')
    expect(buildCodexVersionRefusal('0.142.0')).toContain(
      CODEX_RESIDENT_SERVER_MIN_VERSION,
    )
  })
})

describe('readCodexUnsubscribeStatus', () => {
  it('reads all three answers the server actually gives', () => {
    expect(readCodexUnsubscribeStatus({ status: 'unsubscribed' })).toBe(
      'unsubscribed',
    )
    expect(readCodexUnsubscribeStatus({ status: 'notSubscribed' })).toBe(
      'notSubscribed',
    )
    expect(readCodexUnsubscribeStatus({ status: 'notLoaded' })).toBe(
      'notLoaded',
    )
  })

  it('is null for anything else', () => {
    expect(readCodexUnsubscribeStatus({ status: 'gone' })).toBeNull()
    expect(readCodexUnsubscribeStatus(null)).toBeNull()
    expect(readCodexUnsubscribeStatus('unsubscribed')).toBeNull()
  })
})

describe('buildCodexServerObituary', () => {
  it('quotes the process own last words', () => {
    const note = buildCodexServerObituary({
      code: 1,
      signal: null,
      stderrTail: 'failed to initialize sqlite state runtime under ~/.codex',
    })
    expect(note).toContain('exited with code 1')
    expect(note).toContain('failed to initialize sqlite state runtime')
    expect(note).toContain('resumes this thread')
  })

  it('names the signal when there is no code', () => {
    expect(
      buildCodexServerObituary({
        code: null,
        signal: 'SIGKILL',
        stderrTail: '',
      }),
    ).toContain('SIGKILL')
  })
})

describe('threadContainsClientMessage', () => {
  const turns = {
    data: [
      {
        id: 'turn-1',
        items: [
          {
            type: 'userMessage',
            id: 'item-1',
            clientId: 'cvg-1',
            content: [{ type: 'text', text: 'hello' }],
          },
          { type: 'agentMessage', id: 'item-2', text: 'ok' },
        ],
      },
    ],
    nextCursor: null,
  }

  it('finds the turn we sent but never saw acknowledged', () => {
    expect(threadContainsClientMessage(turns, 'cvg-1')).toBe(true)
  })

  it('does not claim a different turn is ours', () => {
    expect(threadContainsClientMessage(turns, 'cvg-2')).toBe(false)
  })

  it('reads the same items out of a thread/resume payload', () => {
    expect(
      threadContainsClientMessage({ thread: { turns: turns.data } }, 'cvg-1'),
    ).toBe(true)
  })

  it('never matches an empty id, whatever the payload holds', () => {
    expect(
      threadContainsClientMessage(
        { data: [{ items: [{ type: 'userMessage', clientId: '' }] }] },
        '',
      ),
    ).toBe(false)
  })

  it('is a validated negative for a thread whose turns we read and it was not in', () => {
    expect(threadContainsClientMessage({ data: [] }, 'cvg-1')).toBe(false)
    expect(
      threadContainsClientMessage({ data: [], nextCursor: null }, 'cvg-1'),
    ).toBe(false)
  })

  it('never turns a payload it could not read into a negative', () => {
    // The RPC succeeded, so nothing else will ever notice. Collapsing this to
    // `false` authorises resending a turn the model may already have run
    // (MAR-2823 F5).
    expect(threadContainsClientMessage(null, 'cvg-1')).toBe('unreadable')
    expect(threadContainsClientMessage({ turns: 'nope' }, 'cvg-1')).toBe(
      'unreadable',
    )
    expect(threadContainsClientMessage('a thread', 'cvg-1')).toBe('unreadable')
  })

  it('does not call a message absent while a page of history is unread', () => {
    expect(
      threadContainsClientMessage(
        { data: [{ items: [] }], nextCursor: 'page-2' },
        'cvg-1',
      ),
    ).toBe('unreadable')
    // Finding it needs no further page.
    expect(
      threadContainsClientMessage({ ...turns, nextCursor: 'page-2' }, 'cvg-1'),
    ).toBe(true)
  })

  it('does not mistake an agent message carrying the id for our user message', () => {
    expect(
      threadContainsClientMessage(
        { data: [{ items: [{ type: 'agentMessage', clientId: 'cvg-1' }] }] },
        'cvg-1',
      ),
    ).toBe(false)
  })
})

describe('readLandedTurn', () => {
  const completedTurn = {
    data: [
      {
        id: 'turn-9',
        status: 'completed',
        items: [
          { type: 'userMessage', clientId: 'cvg-1' },
          { type: 'agentMessage', text: 'the answer' },
        ],
      },
    ],
    nextCursor: null,
  }

  it('names the turn so steer and interrupt can still reach it', () => {
    expect(readLandedTurn(completedTurn, 'cvg-1')?.turnId).toBe('turn-9')
  })

  it('carries the answer of a turn that finished while nobody was subscribed', () => {
    const landed = readLandedTurn(completedTurn, 'cvg-1')
    expect(landed?.completed).toBe(true)
    expect(landed?.agentText).toBe('the answer')
  })

  it('reads the content-array form of the same agent message', () => {
    const landed = readLandedTurn(
      {
        data: [
          {
            id: 'turn-9',
            status: 'completed',
            items: [
              { type: 'userMessage', clientId: 'cvg-1' },
              {
                type: 'agentMessage',
                content: [
                  { type: 'text', text: 'half ' },
                  { type: 'text', text: 'an answer' },
                ],
              },
            ],
          },
        ],
      },
      'cvg-1',
    )
    expect(landed?.agentText).toBe('half an answer')
  })

  it('leaves a turn still running uncompleted and unhydrated', () => {
    const landed = readLandedTurn(
      {
        data: [
          {
            id: 'turn-9',
            status: 'inProgress',
            items: [{ type: 'userMessage', clientId: 'cvg-1' }],
          },
        ],
      },
      'cvg-1',
    )
    expect(landed?.completed).toBe(false)
    expect(landed?.agentText).toBeNull()
  })

  it('is null when this thread never took our message', () => {
    expect(readLandedTurn(completedTurn, 'cvg-2')).toBeNull()
    expect(readLandedTurn(null, 'cvg-1')).toBeNull()
  })
})

describe('isCodexThreadUnmaterializedError', () => {
  it('reads both refusals the server gives for a thread with no turn yet', () => {
    expect(
      isCodexThreadUnmaterializedError(
        new Error('no rollout found for thread id 01a0-…'),
      ),
    ).toBe(true)
    expect(
      isCodexThreadUnmaterializedError(
        new Error(
          'thread 01a0 is not materialized yet; thread/turns/list is unavailable before first user message',
        ),
      ),
    ).toBe(true)
  })

  it('does not swallow an unrelated failure', () => {
    expect(isCodexThreadUnmaterializedError(new Error('EPIPE'))).toBe(false)
  })
})

describe('parseProcessTable', () => {
  it('reads the pid/ppid pairs `ps -Ao pid,ppid` prints, header and all', () => {
    expect(
      parseProcessTable(
        ['  PID  PPID', '    1     0', ' 4242   999', ' 4243  4242', ''].join(
          '\n',
        ),
      ),
    ).toEqual([
      { pid: 1, ppid: 0 },
      { pid: 4242, ppid: 999 },
      { pid: 4243, ppid: 4242 },
    ])
  })
})

describe('collectDescendantPids', () => {
  const tree = [
    { pid: 1, ppid: 0 },
    { pid: 999, ppid: 1 },
    { pid: 4242, ppid: 999 },
    { pid: 4243, ppid: 4242 },
    { pid: 4244, ppid: 4243 },
    { pid: 5000, ppid: 999 },
  ]

  it('walks the whole tree under the root, deepest first, and nothing beside it', () => {
    // Deepest first is the order a kill must take: a child signalled after its
    // parent is a child that was reparented in between, which is exactly how
    // the Rust grandchild survived (MAR-2823 L2').
    expect(collectDescendantPids(tree, 4242)).toEqual([4244, 4243])
  })

  it('never returns the root, and never a sibling branch', () => {
    expect(collectDescendantPids(tree, 4242)).not.toContain(4242)
    expect(collectDescendantPids(tree, 4242)).not.toContain(5000)
    expect(collectDescendantPids(tree, 4244)).toEqual([])
  })

  it('terminates on a table whose parentage points in a circle', () => {
    // `ps` is a snapshot of a moving system and pids are reused; a cycle is a
    // liar, but it must not become an infinite loop inside app quit.
    expect(
      collectDescendantPids(
        [
          { pid: 10, ppid: 7 },
          { pid: 11, ppid: 10 },
          { pid: 7, ppid: 11 },
        ],
        7,
      ),
    ).toEqual([11, 10])
  })
})
