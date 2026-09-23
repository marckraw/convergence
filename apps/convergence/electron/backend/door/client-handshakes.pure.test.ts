import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import {
  clientEnvironment,
  recordRequest,
  startHelloServer,
  type RecordedRequest,
} from '../../../tools/probe-mcp-door.mjs'
import fixture from './__fixtures__/client-handshakes.json'
import {
  handshakeOf,
  statusOf,
  type RecordedClient,
} from './client-handshakes.pure'

/**
 * The Door S0 (MAR-3173): what Claude Code, Codex and Cursor sent to one
 * `@modelcontextprotocol/server` 2.x endpoint, recorded by
 * `tools/probe-mcp-door.mjs --capture` on Marcin's Mac. These pins go red the
 * day someone re-records and a client has changed — that is their job; S1 is
 * built on these answers, so a changed client is a changed design input.
 */

const clients = (
  fixture as unknown as { clients: Record<string, RecordedClient> }
).clients

describe('client handshakes (R2, R3): the fixture is what the clients sent', () => {
  it('records exactly the three clients, each with its metadata', () => {
    expect(Object.keys(clients).sort()).toEqual(['claude', 'codex', 'cursor'])
    for (const entry of Object.values(clients)) {
      expect(entry.version).not.toBe('')
      expect(entry.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.connect.command).not.toBe('')
      expect(entry.connect.requests.length).toBeGreaterThan(0)
    }
  })

  it('Claude Code speaks the 2026-07-28 stateless protocol', () => {
    expect(handshakeOf(clients.claude)).toEqual({
      protocolVersion: '2026-07-28',
      sendsInitialize: false,
      sendsMcpMethodHeader: true,
      sendsSessionId: false,
      authorizationArrived: true,
      toolsListStatus: 200,
    })
  })

  it('Codex speaks the 2025-06-18 initialize handshake and the default endpoint serves it', () => {
    expect(handshakeOf(clients.codex)).toEqual({
      protocolVersion: '2025-06-18',
      sendsInitialize: true,
      sendsMcpMethodHeader: false,
      sendsSessionId: false,
      authorizationArrived: true,
      toolsListStatus: 200,
    })
  })

  it('Cursor speaks the 2025-11-25 initialize handshake and the default endpoint serves it', () => {
    expect(handshakeOf(clients.cursor)).toEqual({
      protocolVersion: '2025-11-25',
      sendsInitialize: true,
      sendsMcpMethodHeader: false,
      sendsSessionId: false,
      authorizationArrived: true,
      toolsListStatus: 200,
    })
  })

  it('tools/call is proven at the wire only where a model turn reached it', () => {
    expect({
      claude: statusOf(clients.claude.modelTurn, 'tools/call'),
      codex: statusOf(clients.codex.modelTurn, 'tools/call'),
      cursor: statusOf(clients.cursor.modelTurn, 'tools/call'),
    }).toEqual({ claude: 200, codex: 'not measured', cursor: 'not measured' })
  })

  it('every client got 401 on a wrong token, and none was served', () => {
    for (const entry of Object.values(clients)) {
      const statuses = entry.unauthorized?.requests.map(
        (request) => request.response.status,
      )
      expect(statuses?.length).toBeGreaterThan(0)
      expect(new Set(statuses)).toEqual(new Set([401]))
    }
  })
})

describe('the recorder never keeps a secret (R1)', () => {
  const SECRET = 'cvg_probe_secret'

  it('keeps only presence and scheme of the Authorization header', () => {
    const record = recordRequest({
      method: 'POST',
      path: '/mcp',
      headers: {
        Authorization: `Bearer ${SECRET}`,
        Host: '127.0.0.1:1234',
        'Mcp-Method': 'tools/list',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
      response: {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    })

    expect(JSON.stringify(record)).not.toContain(SECRET)
    expect(record.authorization).toEqual({ present: true, scheme: 'Bearer' })
    expect(record.headerNames).toContain('authorization')
  })

  it('keeps no secret when the real server records a real request', async () => {
    const records: RecordedRequest[] = []
    const server = await startHelloServer({
      host: '127.0.0.1',
      port: 0,
      token: SECRET,
      onRecord: (record) => records.push(record),
    })
    try {
      const response = await fetch(server.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${SECRET}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'pure-test', version: '0.0.0' },
          },
        }),
      })
      await response.text()
    } finally {
      await server.close()
    }

    expect(records).toHaveLength(1)
    expect(records[0].response.status).toBe(200)
    expect(JSON.stringify(records)).not.toContain(SECRET)
  })

  it('the committed fixture carries no token', () => {
    const raw = readFileSync(
      fileURLToPath(
        new URL('./__fixtures__/client-handshakes.json', import.meta.url),
      ),
      'utf8',
    )
    // The probe's tokens are 48 hex characters from randomBytes(24).
    expect(raw).not.toMatch(/[0-9a-f]{48}/)
    expect(raw).not.toMatch(/Bearer [0-9a-f]/)
  })
})

describe('a probed client never inherits a provider account', () => {
  it('drops the live session and account variables, keeps the login locator', () => {
    const env = clientEnvironment(
      {
        PATH: '/usr/bin',
        CLAUDECODE: '1',
        CLAUDE_CONFIG_DIR: '/accounts/claude/a',
        CLAUDE_CODE_SESSION_ID: 'live',
        CODEX_HOME: '/accounts/codex/b',
        CLAUDE_SECURESTORAGE_CONFIG_DIR: '/accounts/claude/a',
      },
      { CLAUDE_CONFIG_DIR: '/tmp/probe' },
      'token',
    )

    expect(env).toEqual({
      PATH: '/usr/bin',
      CLAUDE_SECURESTORAGE_CONFIG_DIR: '/accounts/claude/a',
      CLAUDE_CONFIG_DIR: '/tmp/probe',
      CVG_DOOR_PROBE_TOKEN: 'token',
    })
  })
})

describe('the page cannot vanish silently (R5)', () => {
  const repoFile = (path: string) =>
    readFileSync(
      fileURLToPath(new URL(`../../../../../${path}`, import.meta.url)),
      'utf8',
    )

  it('quick-reference links the page, and the page names the tool', () => {
    expect(repoFile('docs/architecture/quick-reference.md')).toContain(
      'docs/architecture/mcp-door-surface.md',
    )
    expect(repoFile('docs/architecture/mcp-door-surface.md')).toContain(
      'tools/probe-mcp-door.mjs',
    )
  })

  it('answers Q1–Q6 in order, each with the command that measured it and the date', () => {
    const page = repoFile('docs/architecture/mcp-door-surface.md')
    const sections = page.split(/^## (?=Q\d)/m).slice(1)
    expect(sections.map((section) => section.slice(0, 2))).toEqual([
      'Q1',
      'Q2',
      'Q3',
      'Q4',
      'Q5',
      'Q6',
    ])
    for (const section of sections) {
      expect(section).toMatch(/measured by: /i)
      expect(section).toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  })

  it('states measurements, never guesses', () => {
    expect(repoFile('docs/architecture/mcp-door-surface.md')).not.toMatch(
      /\b(should|probably)\b/i,
    )
  })
})
