import { describe, expect, it } from 'vitest'
import { EXECUTION_HOST_PROTOCOL_VERSION } from './execution-host-protocol.types'
import {
  buildRemoteExecutionHostStartRequest,
  describeRemoteExecutionHostFailure,
  capabilitiesForRemoteProvider,
  createSseParser,
  descriptorForRemoteProvider,
  parseRemoteExecutionHostMeta,
  parseRemoteExecutionHostStartResponse,
  parseRemoteSessionWorkspaceInfo,
  remoteExecutionHostReconnectDelayMs,
} from './remote-execution-host.pure'
import { RemoteExecutionHostError } from './remote-execution-host.types'

const DAEMON_META = {
  name: 'agents-daemon',
  version: '0.1.0',
  apiVersion: 'v0',
  providers: [
    {
      id: 'claude',
      label: 'Claude Code',
      available: true,
      authenticated: true,
      cliVersion: '2.1.175',
      details: 'ready',
      models: [
        { slug: 'sonnet', label: 'Claude Sonnet' },
        { slug: 'opus', label: 'Claude Opus' },
      ],
      features: {
        streaming: true,
        resume: true,
        followup: true,
        structuredRequests: false,
        planMode: true,
      },
    },
    {
      id: 'codex',
      label: 'Codex',
      available: false,
      authenticated: false,
      cliVersion: null,
      details: 'missing binary',
      models: [],
      features: { streaming: true, resume: false, followup: true },
    },
  ],
}

describe('parseRemoteExecutionHostMeta', () => {
  it('maps the daemon provider listing to provider infos', () => {
    const infos = parseRemoteExecutionHostMeta(DAEMON_META)
    expect(infos).toEqual([
      {
        providerId: 'claude',
        name: 'Claude Code',
        available: true,
        authenticated: true,
        supportsContinuation: true,
        models: [
          { id: 'sonnet', label: 'Claude Sonnet' },
          { id: 'opus', label: 'Claude Opus' },
        ],
      },
      {
        providerId: 'codex',
        name: 'Codex',
        available: false,
        authenticated: false,
        supportsContinuation: false,
        models: [],
      },
    ])
  })

  it('throws a malformed error when the provider listing is missing', () => {
    expect(() => parseRemoteExecutionHostMeta({ name: 'daemon' })).toThrow(
      RemoteExecutionHostError,
    )
    try {
      parseRemoteExecutionHostMeta({})
    } catch (error) {
      expect((error as RemoteExecutionHostError).kind).toBe('malformed')
    }
  })

  it('throws a malformed error for a broken provider entry', () => {
    expect(() =>
      parseRemoteExecutionHostMeta({ providers: [{ id: 42 }] }),
    ).toThrow('malformed provider entry')
  })

  it('skips malformed model entries instead of failing the listing', () => {
    const infos = parseRemoteExecutionHostMeta({
      providers: [
        {
          id: 'claude',
          label: 'Claude',
          available: true,
          authenticated: true,
          models: [{ nope: true }, { slug: 'sonnet' }],
          features: { resume: true },
        },
      ],
    })
    expect(infos[0]?.models).toEqual([{ id: 'sonnet', label: 'sonnet' }])
  })
})

describe('capabilitiesForRemoteProvider', () => {
  it('never advertises one-shot support', () => {
    const [claude] = parseRemoteExecutionHostMeta(DAEMON_META)
    expect(capabilitiesForRemoteProvider(claude!)).toEqual({
      providerId: 'claude',
      name: 'Claude Code',
      supportsContinuation: true,
      supportsOneShot: false,
    })
  })
})

describe('descriptorForRemoteProvider', () => {
  it('synthesizes a conservative descriptor from the listing', () => {
    const [claude] = parseRemoteExecutionHostMeta(DAEMON_META)
    const descriptor = descriptorForRemoteProvider(claude!)
    expect(descriptor).toMatchObject({
      id: 'claude',
      name: 'Claude Code',
      kind: 'conversation',
      supportsContinuation: true,
      defaultModelId: 'sonnet',
      midRunInput: {
        supportsNativeFollowUp: true,
        defaultRunningMode: 'follow-up',
      },
    })
    expect(descriptor.modelOptions.map((m) => m.id)).toEqual(['sonnet', 'opus'])
    expect(descriptor.attachments.supportsImage).toBe(false)
  })

  it('defaults the model id to empty when the listing has no models', () => {
    const [, codex] = parseRemoteExecutionHostMeta(DAEMON_META)
    expect(descriptorForRemoteProvider(codex!).defaultModelId).toBe('')
  })
})

describe('start request and response', () => {
  it('builds a versioned start request around the session config', () => {
    const request = buildRemoteExecutionHostStartRequest('claude', {
      sessionId: 's-1',
      workingDirectory: '/work',
      initialMessage: 'hello',
      model: 'sonnet',
      effort: null,
      continuationToken: null,
    })
    expect(request.protocolVersion).toBe(EXECUTION_HOST_PROTOCOL_VERSION)
    expect(request.providerId).toBe('claude')
    expect(request.config.sessionId).toBe('s-1')
  })

  it('parses the echoed session id and rejects malformed responses', () => {
    expect(
      parseRemoteExecutionHostStartResponse({
        protocolVersion: 1,
        sessionId: 's-1',
      }),
    ).toEqual({ sessionId: 's-1' })
    expect(() => parseRemoteExecutionHostStartResponse({})).toThrow(
      RemoteExecutionHostError,
    )
  })
})

describe('createSseParser', () => {
  it('parses events split across arbitrary chunk boundaries', () => {
    const parser = createSseParser()
    const events = [
      ...parser.feed('id: 1\nda'),
      ...parser.feed('ta: {"a":1}\n\nid: 2\n'),
      ...parser.feed('data: {"b":2}\n\n'),
    ]
    expect(events).toEqual([
      { id: '1', data: '{"a":1}' },
      { id: '2', data: '{"b":2}' },
    ])
  })

  it('joins multiple data lines with newlines', () => {
    const parser = createSseParser()
    expect(parser.feed('data: one\ndata: two\n\n')).toEqual([
      { id: null, data: 'one\ntwo' },
    ])
  })

  it('ignores comment lines and unknown fields and handles CRLF', () => {
    const parser = createSseParser()
    expect(
      parser.feed(': keep-alive\r\nretry: 500\r\nid: 7\r\ndata: x\r\n\r\n'),
    ).toEqual([{ id: '7', data: 'x' }])
  })

  it('emits nothing for blank lines without pending data', () => {
    const parser = createSseParser()
    expect(parser.feed('\n\n: comment\n\n')).toEqual([])
  })
})

describe('remoteExecutionHostReconnectDelayMs', () => {
  it('backs off exponentially and caps at thirty seconds', () => {
    expect(remoteExecutionHostReconnectDelayMs(1)).toBe(1000)
    expect(remoteExecutionHostReconnectDelayMs(2)).toBe(2000)
    expect(remoteExecutionHostReconnectDelayMs(3)).toBe(4000)
    expect(remoteExecutionHostReconnectDelayMs(10)).toBe(30_000)
  })
})

describe('describeRemoteExecutionHostFailure', () => {
  it('appends the HTTP status and an actionable hint by error kind', () => {
    expect(
      describeRemoteExecutionHostFailure(
        new RemoteExecutionHostError('Invalid API token', 'auth', 401),
      ),
    ).toBe(
      'Invalid API token (HTTP 401) The daemon rejected the API token; update it in Settings under Remote execution host.',
    )
    expect(
      describeRemoteExecutionHostFailure(
        new RemoteExecutionHostError('ECONNREFUSED', 'network'),
      ),
    ).toContain('Test connection in Settings')
  })

  it('passes through plain errors and http errors without hints', () => {
    expect(describeRemoteExecutionHostFailure(new Error('boom'))).toBe('boom')
    expect(
      describeRemoteExecutionHostFailure(
        new RemoteExecutionHostError(
          'Workspace materialization failed: repo not found',
          'http',
          400,
        ),
      ),
    ).toBe('Workspace materialization failed: repo not found (HTTP 400)')
  })
})

describe('parseRemoteSessionWorkspaceInfo', () => {
  it('extracts the workspace and pull request from a snapshot', () => {
    expect(
      parseRemoteSessionWorkspaceInfo({
        sessionId: 's-1',
        workspace: {
          repository: 'https://github.com/acme/repo.git',
          branchName: 'agent/12345678',
          baseRef: 'main',
        },
        prUrl: 'https://github.com/acme/repo/pull/7',
      }),
    ).toEqual({
      workspace: {
        repository: 'https://github.com/acme/repo.git',
        branchName: 'agent/12345678',
        baseRef: 'main',
      },
      prUrl: 'https://github.com/acme/repo/pull/7',
    })
  })

  it('handles snapshots without workspace or pull request', () => {
    expect(parseRemoteSessionWorkspaceInfo({ sessionId: 's-1' })).toEqual({
      workspace: null,
      prUrl: null,
    })
    expect(() => parseRemoteSessionWorkspaceInfo('nope')).toThrow(
      RemoteExecutionHostError,
    )
  })
})
