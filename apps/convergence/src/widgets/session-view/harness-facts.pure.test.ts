import { isMcpAlertStatus } from './harness-facts.pure'
import { describe, expect, it } from 'vitest'
import {
  placeCompactions,
  harnessPill,
  compactionLabel,
  hiddenPluginSentence,
  hiddenPluginServers,
  mcpReconnectErrorFor,
  mcpReconnectUnavailable,
  mcpRefusal,
  mcpStatusHeading,
} from './harness-facts.pure'
import type { SessionHarnessFacts } from '@/shared/types/harness-facts.types'
const compact = {
  kind: 'harness.compaction' as const,
  at: 'now',
  sequence: 1,
  trigger: 'auto',
  preTokens: 84000,
  postTokens: 12000,
  durationMs: null,
}
it('R9 pill uses the same current-turn fold as the popover — mutation separate hook count', () => {
  const facts = {
    currentTurn: {
      hooks: [{}, {}],
      denials: [{}],
      retries: { state: 'succeeded', attempts: 3 },
    },
    compactions: [compact],
    init: null,
  } as unknown as SessionHarnessFacts
  expect(harnessPill(facts)).toEqual({
    label: 'Harness · hooks 2 · retry 3 · denied 1',
    alert: false,
    reason: null,
  })
})
it.each([
  ['in-flight', 'retrying', true],
  ['failed', 'retry failed', false],
  ['unknown', 'retry ?', false],
] as const)(
  'R4prime %s label and red state — mutation guess resolution',
  (state, text, alert) => {
    const facts = {
      currentTurn: {
        hooks: [],
        denials: null,
        retries: { state, attempts: 2 },
      },
      compactions: [],
      init: null,
    } as unknown as SessionHarnessFacts
    expect(harnessPill(facts)).toEqual({
      label: `Harness · ${text}`,
      alert,
      reason: alert ? text : null,
    })
  },
)
it('R3 disconnected MCP is red — mutation ignore MCP status', () => {
  expect(
    harnessPill({
      currentTurn: null,
      compactions: [],
      init: {
        mcpServers: {
          total: 1,
          connected: 0,
          others: [{ name: 'linear', status: 'failed' }],
          omittedAlerts: 0,
          omitted: 0,
        },
      },
    } as unknown as SessionHarnessFacts).alert,
  ).toBe(true)
})
it('R5 compaction format carries the recorded boundary — mutation discard post tokens', () => {
  expect(compactionLabel(compact)).toBe('Compacted (auto) · 84k → 12k tokens')
})

it('places boundaries by timestamp and preserves sequence ties — mutation put every compaction at the tail turns red', () => {
  const fact = {
    kind: 'harness.compaction' as const,
    trigger: 'auto',
    preTokens: null,
    postTokens: null,
    durationMs: null,
  }
  const middle = { ...fact, sequence: 2, at: '2026-01-01T00:00:02Z' },
    first = { ...fact, sequence: 1, at: middle.at },
    tail = { ...fact, sequence: 3, at: '2026-01-01T00:00:04Z' }
  const placed = placeCompactions(
    [
      { id: 'a', createdAt: '2026-01-01T00:00:01Z' },
      { id: 'b', createdAt: '2026-01-01T00:00:03Z' },
    ],
    [tail, middle, first],
  )
  expect({
    before: [...placed.before],
    tail: placed.tail,
    empty: placeCompactions([], [tail]).tail,
  }).toEqual({ before: [['b', [first, middle]]], tail: [tail], empty: [tail] })
})

it.each([
  ['connected', false],
  ['pending', false],
  ['disabled', false],
  ['failed', true],
  ['needs-auth', true],
] as const)(
  'I4 MCP %s vocabulary — mutation invert alert statuses turns red',
  (status, alert) => {
    expect({
      status: isMcpAlertStatus(status),
      pill: harnessPill({
        currentTurn: null,
        compactions: [],
        init: {
          mcpServers: {
            total: 1,
            connected: 0,
            others: [{ name: 'server', status }],
            omittedAlerts: 0,
            omitted: 0,
          },
        },
      } as unknown as SessionHarnessFacts).alert,
    }).toEqual({ status: alert, pill: alert })
  },
)

it('small compaction placement searches stable time order — mutation search render order turns red', () => {
  const fact = { ...compact, at: '2026-01-01T00:00:02Z' }
  const placed = placeCompactions(
    [
      { id: 'late', createdAt: '2026-01-01T00:00:05Z' },
      { id: 'tie-first', createdAt: '2026-01-01T00:00:03Z' },
      { id: 'tie-second', createdAt: '2026-01-01T00:00:03Z' },
    ],
    [fact],
  )
  expect([...placed.before]).toEqual([['tie-first', [fact]]])
})
it('RUN61 r5 omitted alert count controls the pill — mutation ignore omittedAlerts turns red', () => {
  const alerts = [0, 2].map(
    (omittedAlerts) =>
      harnessPill({
        turns: [],
        currentTurn: null,
        compactions: [],
        rateLimit: null,
        init: {
          kind: 'harness.init',
          at: 'now',
          claudeCodeVersion: null,
          model: null,
          permissionMode: null,
          mcpServers: {
            total: 2,
            connected: 0,
            others: [],
            omitted: 2,
            omittedAlerts,
          },
          plugins: null,
          capabilities: null,
          tools: null,
          skills: null,
          slashCommands: null,
        },
      }).alert,
  )
  expect(alerts).toEqual([false, true])
})

it('O1 R4 hides compactions before a partial window and restores them when their history loads', () => {
  const facts = [
    { ...compact, at: '2026-01-01' },
    { ...compact, sequence: 2, at: '2026-01-03' },
  ]
  const items = [
    { id: 'pin', createdAt: '2025-12-01' },
    { id: 'first', createdAt: '2026-01-02' },
    { id: 'last', createdAt: '2026-01-04' },
  ]
  expect([...placeCompactions(items, facts, '2026-01-02').before]).toEqual([
    ['last', [facts[1]]],
  ])
  expect([...placeCompactions(items, facts).before]).toEqual([
    ['first', [facts[0]]],
    ['last', [facts[1]]],
  ])
})

function pillFacts(
  statuses: (string | null)[],
  omittedAlerts = 0,
): SessionHarnessFacts {
  return {
    currentTurn: null,
    compactions: [compact],
    init: {
      mcpServers: {
        others: statuses.map((status) => ({ name: status, status })),
        omittedAlerts,
      },
    },
  } as unknown as SessionHarnessFacts
}
it.each([
  'connected',
  'pending',
  'disabled',
  'failed',
  'needs-auth',
  'unknown',
  null,
])('CH1 C chip and detail alerts agree for %s', (status) => {
  const pill = harnessPill(pillFacts([status]))
  expect(pill.alert).toBe(isMcpAlertStatus(status))
  if (pill.alert) {
    expect(pill.reason).not.toBeNull()
    expect(pill.label).toContain(pill.reason)
    if (status !== 'needs-auth' && status !== 'failed') {
      expect(pill.reason).toBe('1 integration needs attention')
    }
  }
})
it('CH1 R1 the alert reason leads the label even with compaction history', () => {
  expect(harnessPill(pillFacts(['needs-auth']))).toEqual({
    label: 'Harness · 1 integration needs sign-in',
    alert: true,
    reason: '1 integration needs sign-in',
  })
  expect(harnessPill(pillFacts(['failed', 'failed']))).toEqual({
    label: 'Harness · 2 integrations failed',
    alert: true,
    reason: '2 integrations failed',
  })
})
it('CH1 R1 compaction history alone is quiet and absent from the pill', () => {
  expect(harnessPill(pillFacts([]))).toEqual({
    label: 'Harness',
    alert: false,
    reason: null,
  })
})
it('CH1 R1 omitted alerts count without inventing their statuses', () => {
  expect(harnessPill(pillFacts(['needs-auth'], 2))).toEqual({
    label:
      'Harness · 1 integration needs sign-in · 2 more integrations need attention',
    alert: true,
    reason: '1 integration needs sign-in · 2 more integrations need attention',
  })
})

describe('MAR-3206 R2 — a claude.ai connector hiding a plugin server', () => {
  const connector = (status: string) => ({
    name: 'claude.ai Figma',
    status,
    scope: 'claudeai',
    origin: 'https://mcp.figma.com',
  })
  const figmaPlugin = {
    plugin: 'figma',
    server: 'figma',
    origin: 'https://mcp.figma.com',
    loaded: false,
  }
  const sentence =
    "claude.ai Figma needs sign-in and is hiding the Figma plugin's server (same address). Authorize Figma at claude.ai → Settings → Connectors, then Reconnect."

  it.each([
    [
      'duplicate in needs-auth',
      [connector('needs-auth')],
      [figmaPlugin],
      [sentence],
    ],
    ['connector connected', [connector('connected')], [figmaPlugin], []],
    ['no plugin', [connector('needs-auth')], [], []],
    [
      'the plugin server is present after all',
      [
        connector('needs-auth'),
        {
          name: 'plugin:figma:figma',
          status: 'connected',
          scope: 'dynamic',
          origin: 'https://mcp.figma.com',
        },
      ],
      [{ ...figmaPlugin, loaded: true }],
      [],
    ],
    [
      // R10: the process loaded it under a name the bound cut, and the
      // recorded `loaded` -- decided on the whole name -- still says so.
      'the plugin server is loaded under a name the bound cut',
      [
        connector('needs-auth'),
        {
          name: `plugin:figma:${'f'.repeat(52)}`,
          status: 'connected',
          scope: 'dynamic',
          origin: 'https://mcp.figma.com',
          nameTruncated: true as const,
        },
      ],
      [{ ...figmaPlugin, server: 'f'.repeat(70), loaded: true }],
      [],
    ],
    [
      'a user-scope server at the same address is not a claude.ai connector',
      [{ ...connector('needs-auth'), scope: 'user' }],
      [figmaPlugin],
      [],
    ],
  ])('%s', (_label, status, plugins, sentences) => {
    expect(
      hiddenPluginServers(status, plugins).map(hiddenPluginSentence),
    ).toEqual(sentences)
  })

  it('matches by origin, never by name — match on name instead and this turns red', () => {
    // Same address, unrelated names: the harness compares addresses.
    expect(
      hiddenPluginServers(
        [connector('needs-auth')],
        [
          {
            plugin: 'design-tools',
            server: 'canvas',
            origin: 'https://mcp.figma.com',
            loaded: false,
          },
        ],
      ).map((entry) => entry.plugin),
    ).toEqual(['design-tools'])
    // Same name, another address: nothing is hidden.
    expect(
      hiddenPluginServers(
        [connector('needs-auth')],
        [
          {
            plugin: 'figma',
            server: 'figma',
            origin: 'https://figma.internal.example',
            loaded: false,
          },
        ],
      ),
    ).toEqual([])
  })
})

it('MAR-3206 R3 the pill reads the newer MCP status over the start record — a reconnected server is no longer an alert', () => {
  const init = {
    kind: 'harness.init' as const,
    at: 'start',
    claudeCodeVersion: null,
    model: null,
    permissionMode: null,
    mcpServers: {
      total: 1,
      connected: 0,
      others: [{ name: 'claude.ai Figma', status: 'needs-auth' }],
      omitted: 0,
      omittedAlerts: 0,
    },
    plugins: null,
    capabilities: null,
    tools: null,
    skills: null,
    slashCommands: null,
  }
  const facts: SessionHarnessFacts = {
    turns: [],
    currentTurn: null,
    compactions: [],
    rateLimit: null,
    init,
  }
  expect(harnessPill(facts).alert).toBe(true)
  expect(
    harnessPill({
      ...facts,
      mcpStatus: {
        kind: 'harness.mcpStatus',
        at: 'later',
        servers: [
          {
            name: 'claude.ai Figma',
            status: 'connected',
            scope: 'claudeai',
            origin: 'https://mcp.figma.com',
          },
        ],
        connected: 1,
        omitted: 0,
        omittedAlerts: 0,
        pluginServers: [],
      },
    }).alert,
  ).toBe(false)
})

it('MAR-3206 R3 names why Reconnect is unavailable, and strips the IPC prefix from a refusal', () => {
  expect(mcpReconnectUnavailable(true)).toBeNull()
  expect(mcpReconnectUnavailable(undefined)).toBe(
    'no process is running; the next message starts one and reads its connectors afresh',
  )
  expect(
    mcpRefusal(
      new Error(
        "Error invoking remote method 'session:refreshMcpServers': Error: MCP server needs authentication",
      ),
    ),
  ).toBe('MCP server needs authentication')
})

describe('MAR-3206 R5 R6 R7 — the MCP heading and a Reconnect error', () => {
  const at = '2026-09-25T19:02:00.000Z'
  const status = (
    servers: { name: string; status: string }[],
    extra: { connected?: number; omitted?: number } = {},
  ) => ({
    kind: 'harness.mcpStatus' as const,
    at,
    servers: servers.map((server) => ({
      ...server,
      scope: 'claudeai',
      origin: 'https://mcp.figma.com',
    })),
    connected:
      extra.connected ??
      servers.filter((server) => server.status === 'connected').length,
    omitted: extra.omitted ?? 0,
    omittedAlerts: 0,
    pluginServers: [],
  })

  it('R5 R13 says since when the list is unchanged and whether a process runs — whenever none runs, not only with alerts; "read at" back and this turns red', () => {
    const allConnected = status([{ name: 'linear', status: 'connected' }])
    const time = new Date(at).toLocaleTimeString()
    expect({
      running: mcpStatusHeading(allConnected, true),
      stopped: mcpStatusHeading(allConnected, false),
      unknown: mcpStatusHeading(allConnected, null),
    }).toEqual({
      running: `MCP servers · 1 connected of 1 · unchanged since ${time} · process running`,
      stopped: `MCP servers · 1 connected of 1 · unchanged since ${time} · no process is running; the next message starts one and reads its connectors afresh`,
      unknown: `MCP servers · 1 connected of 1 · unchanged since ${time}`,
    })
  })

  it('R7 the heading counts connected over the whole status — count over the listed servers and this turns red', () => {
    const listed = Array.from({ length: 20 }, (_, index) => ({
      name: `s${index}`,
      status: 'connected',
    }))
    expect(
      mcpStatusHeading(status(listed, { connected: 25, omitted: 5 }), null),
    ).toMatch(/^MCP servers · 25 connected of 25 · /)
  })

  it('R6 an error shows only while its server is still an alert in the latest status', () => {
    const error = { server: 'claude.ai Figma', message: 'needs authentication' }
    expect({
      alert: mcpReconnectErrorFor(
        error,
        status([{ name: 'claude.ai Figma', status: 'needs-auth' }]),
      ),
      connected: mcpReconnectErrorFor(
        error,
        status([{ name: 'claude.ai Figma', status: 'connected' }]),
      ),
      gone: mcpReconnectErrorFor(error, status([])),
      noStatus: mcpReconnectErrorFor(error, undefined),
      none: mcpReconnectErrorFor(
        null,
        status([{ name: 'claude.ai Figma', status: 'failed' }]),
      ),
    }).toEqual({
      alert: error,
      connected: null,
      gone: null,
      noStatus: null,
      none: null,
    })
  })
})
