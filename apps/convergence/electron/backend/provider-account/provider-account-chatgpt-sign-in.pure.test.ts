import { describe, expect, it } from 'vitest'
import {
  chatGptAppLinkOwner,
  chooseChatGptSignInProbe,
  classifyChatGptSignInProbe,
  describeChatGptIdentity,
  groupCodexAppTools,
  isBuiltInChatGptApp,
  isMcpServerStarting,
  planConfiguredServerCheck,
  type CodexAppTool,
} from './provider-account-chatgpt-sign-in.pure'

function tool(
  name: string,
  {
    readOnly = true,
    required = [] as string[],
    app = 'connector_x',
    owner = null as { email?: string; name?: string } | null,
  } = {},
): CodexAppTool {
  return {
    name,
    annotations: { readOnlyHint: readOnly },
    inputSchema: { required },
    _meta: { connector_id: app, link_owner_profile: owner },
  }
}

/** Figma's answer for a link that needs signing in again (2026-09-27). */
const FIGMA_REAUTH = {
  content: [],
  isError: true,
  structuredContent: {
    error:
      'This app connection requires reauthentication before other actions on this app can succeed.',
    error_code: 'UNAUTHORIZED',
    error_data: {
      detail: 'Reauthentication required',
      action: 'TRIGGER_REAUTHENTICATION',
      reason: 'www_authenticate_reauth',
    },
  },
}

/** figma.whoami's answer for a working link: JSON as text content. */
const FIGMA_WHOAMI = {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        handle: 'Marcin Krawczyk',
        email: 'marcin.krawczyk@ef.com',
        plans: [{ name: 'EF', seat: 'Full' }],
      }),
    },
  ],
}

/** github.get_profile's answer: structured content. */
const GITHUB_PROFILE = {
  content: [],
  structuredContent: {
    id: '8228270',
    name: 'Marcin Krawczyk',
    email: 'marckraw@icloud.com',
    nickname: 'marckraw',
  },
}

describe('MAR-3470 which apps are checked, and how', () => {
  it("OpenAI's own apps need no user sign-in", () => {
    expect(isBuiltInChatGptApp('connector_openai_hotline')).toBe(true)
    expect(isBuiltInChatGptApp('connector_68df038e0ba4819190')).toBe(false)
  })
  it('groups the codex_apps tools by app and skips tools without one', () => {
    const grouped = groupCodexAppTools([
      tool('figma.whoami', { app: 'figma' }),
      tool('figma.get_file', { app: 'figma' }),
      tool('github.get_profile', { app: 'github' }),
      { name: 'orphan', _meta: null },
    ])
    expect([...grouped.keys()]).toEqual(['figma', 'github'])
    expect(grouped.get('figma')?.map((entry) => entry.name)).toEqual([
      'figma.whoami',
      'figma.get_file',
    ])
  })
  it("the link owner is ChatGPT's record: email first, then name, else none", () => {
    expect(
      chatGptAppLinkOwner([
        tool('a'),
        tool('b', { owner: { email: 'me@ef.com', name: 'Me' } }),
      ]),
    ).toBe('me@ef.com')
    expect(chatGptAppLinkOwner([tool('a', { owner: { name: 'Me' } })])).toBe(
      'Me',
    )
    expect(chatGptAppLinkOwner([tool('a')])).toBeNull()
  })
  it('a known identity tool wins, with its own arguments', () => {
    expect(
      chooseChatGptSignInProbe([tool('figma.get_file'), tool('figma.whoami')]),
    ).toEqual({ tool: 'figma.whoami', arguments: {}, identity: true })
    expect(
      chooseChatGptSignInProbe([
        tool('linear.get_user', { required: ['query'] }),
      ]),
    ).toEqual({
      tool: 'linear.get_user',
      arguments: { query: 'me' },
      identity: true,
    })
  })
  it('otherwise only a call whose name says "who am I"', () => {
    expect(
      chooseChatGptSignInProbe([
        tool('acme.archive_list'),
        tool('acme.whoami'),
        tool('acme.delete_thing', { readOnly: false }),
      ]),
    ).toEqual({ tool: 'acme.whoami', arguments: {}, identity: true })
    expect(chooseChatGptSignInProbe([tool('acme.get_current_user')])).toEqual({
      tool: 'acme.get_current_user',
      arguments: {},
      identity: true,
    })
  })
  it('never a list, an export or a lookalike, even read-only: the app stays unchecked', () => {
    expect(
      chooseChatGptSignInProbe([
        tool('acme.alpha_list'),
        tool('acme.export_all'),
        tool('acme.get_company_profile'),
        tool('acme.list_viewers'),
      ]),
    ).toBeNull()
  })
  it('never a who-am-I call that writes or needs arguments', () => {
    expect(
      chooseChatGptSignInProbe([tool('acme.whoami', { readOnly: false })]),
    ).toBeNull()
    expect(
      chooseChatGptSignInProbe([tool('acme.whoami', { required: ['id'] })]),
    ).toBeNull()
  })
  it('never a who-am-I call marked destructive', () => {
    expect(
      chooseChatGptSignInProbe([
        {
          ...tool('acme.whoami'),
          annotations: { readOnlyHint: true, destructiveHint: true },
        },
      ]),
    ).toBeNull()
  })
  it('never a tool that writes or needs arguments; none leaves the app unchecked', () => {
    expect(
      chooseChatGptSignInProbe([
        tool('acme.whoami_write', { readOnly: false }),
        tool('acme.get_user', { required: ['id'] }),
      ]),
    ).toBeNull()
    expect(chooseChatGptSignInProbe([])).toBeNull()
  })
})

describe('MAR-3470 who the answer names', () => {
  it('name and email together', () => {
    expect(
      describeChatGptIdentity({
        handle: 'Marcin Krawczyk',
        email: 'marcin.krawczyk@ef.com',
      }),
    ).toBe('Marcin Krawczyk (marcin.krawczyk@ef.com)')
  })
  it('a nested user, an email alone, a login alone, nothing', () => {
    expect(
      describeChatGptIdentity({ user: { name: 'Anna', email: 'a@x.io' } }),
    ).toBe('Anna (a@x.io)')
    expect(describeChatGptIdentity({ email: 'a@x.io' })).toBe('a@x.io')
    expect(describeChatGptIdentity({ login: 'marckraw' })).toBe('marckraw')
    expect(describeChatGptIdentity({ plans: [] })).toBeNull()
    expect(describeChatGptIdentity(null)).toBeNull()
  })
})

describe('MAR-3470 what one call observed', () => {
  it("Figma's reauthentication answer is a sign-in that needs doing again", () => {
    expect(
      classifyChatGptSignInProbe(
        { response: FIGMA_REAUTH },
        { identity: true },
      ),
    ).toEqual({ status: 'needs-sign-in', account: null, reason: null })
  })
  it('the same refusal as text, or as a thrown RPC error, reads the same', () => {
    expect(
      classifyChatGptSignInProbe(
        {
          response: {
            isError: true,
            content: [{ type: 'text', text: 'Reauthentication required' }],
          },
        },
        { identity: false },
      ).status,
    ).toBe('needs-sign-in')
    expect(
      classifyChatGptSignInProbe(
        {
          error: new Error(
            'This app connection requires reauthentication before other actions',
          ),
        },
        { identity: true },
      ).status,
    ).toBe('needs-sign-in')
  })
  it('a bare UNAUTHORIZED is a refusal, not a sign-in to redo', () => {
    expect(
      classifyChatGptSignInProbe(
        {
          response: {
            isError: true,
            structuredContent: {
              error: 'You are not allowed to read this workspace',
              error_code: 'UNAUTHORIZED',
            },
          },
        },
        { identity: true },
      ),
    ).toEqual({
      status: 'failed',
      account: null,
      reason: 'You are not allowed to read this workspace',
    })
  })
  it('a working answer that mentions reauthentication is still a working answer', () => {
    expect(
      classifyChatGptSignInProbe(
        {
          response: {
            content: [
              {
                type: 'text',
                text: '{"name":"Docs on reauthentication required flows"}',
              },
            ],
          },
        },
        { identity: false },
      ).status,
    ).toBe('signed-in')
  })
  it('no answer at all is not a sign-in', () => {
    for (const response of [null, undefined, {}, 'ok', { isError: false }])
      expect(
        classifyChatGptSignInProbe({ response }, { identity: true }),
      ).toEqual({
        status: 'failed',
        account: null,
        reason: 'Codex returned no answer from the app.',
      })
  })
  it('a thrown object without a message still reads as words', () => {
    const { reason } = classifyChatGptSignInProbe(
      { error: { code: -32000 } },
      { identity: true },
    )
    expect(reason).toBe('{"code":-32000}')
  })
  it('any other failure is "couldn\'t check" with one readable reason', () => {
    expect(
      classifyChatGptSignInProbe(
        {
          response: {
            isError: true,
            structuredContent: { error: 'Rate limited, try later' },
          },
        },
        { identity: true },
      ),
    ).toEqual({
      status: 'failed',
      account: null,
      reason: 'Rate limited, try later',
    })
    const thrown = classifyChatGptSignInProbe(
      {
        error: new Error(
          'status 502: <html><body><h1>Bad gateway</h1></body></html>',
        ),
      },
      { identity: true },
    )
    expect(thrown.status).toBe('failed')
    expect(thrown.reason).not.toMatch(/[<>]/)
  })
  it('a working identity call names who you are signed in as', () => {
    expect(
      classifyChatGptSignInProbe(
        { response: FIGMA_WHOAMI },
        { identity: true },
      ),
    ).toEqual({
      status: 'signed-in',
      account: 'Marcin Krawczyk (marcin.krawczyk@ef.com)',
      reason: null,
    })
    expect(
      classifyChatGptSignInProbe(
        { response: GITHUB_PROFILE },
        { identity: true },
      ).account,
    ).toBe('Marcin Krawczyk (marckraw@icloud.com)')
  })
  it('a working call that is not about you says signed in without a name', () => {
    expect(
      classifyChatGptSignInProbe(
        { response: GITHUB_PROFILE },
        { identity: false },
      ),
    ).toEqual({ status: 'signed-in', account: null, reason: null })
  })
})

describe('MAR-3470 servers configured on this Mac, observed live', () => {
  const server = (
    name: string,
    runtimeStatus: string | null,
    extra: Partial<{
      authStatus: string
      toolsError: string
      tools: string[]
    }> = {},
  ) => ({
    name,
    runtimeStatus,
    authStatus: extra.authStatus ?? 'oAuth',
    toolsError: extra.toolsError ?? null,
    tools: Object.fromEntries(
      (extra.tools ?? []).map((toolName) => [toolName, tool(toolName)]),
    ),
  })
  it('Codex saying authentication is required is a sign-in to redo, no call needed', () => {
    expect(
      planConfiguredServerCheck(server('linear', 'authenticationRequired')),
    ).toEqual({
      kind: 'verdict',
      verdict: { status: 'needs-sign-in', account: null, reason: null },
    })
  })
  it('a server that failed or never finished starting says why', () => {
    expect(
      planConfiguredServerCheck(
        server('linear', 'failed', { toolsError: 'handshake timed out' }),
      ),
    ).toEqual({
      kind: 'verdict',
      verdict: {
        status: 'failed',
        account: null,
        reason: 'handshake timed out',
      },
    })
    expect(planConfiguredServerCheck(server('linear', 'starting'))).toEqual({
      kind: 'verdict',
      verdict: {
        status: 'failed',
        account: null,
        reason: 'The server did not finish starting.',
      },
    })
    expect(isMcpServerStarting(server('x', 'starting'))).toBe(true)
    expect(isMcpServerStarting(server('x', 'notStarted'))).toBe(true)
    expect(isMcpServerStarting(server('x', 'connected'))).toBe(false)
  })
  it('a connected Linear or Figma is asked who you are, by its own call', () => {
    expect(
      planConfiguredServerCheck(
        server('linear', 'connected', { tools: ['list_issues', 'get_user'] }),
      ),
    ).toEqual({
      kind: 'probe',
      probe: { tool: 'get_user', arguments: { query: 'me' }, identity: true },
    })
    expect(
      planConfiguredServerCheck(
        server('figma', 'connected', { tools: ['get_file', 'whoami'] }),
      ),
    ).toEqual({
      kind: 'probe',
      probe: { tool: 'whoami', arguments: {}, identity: true },
    })
  })
  it('another connected server with a plain who-am-I tool is asked too', () => {
    expect(
      planConfiguredServerCheck(
        server('acme', 'connected', { tools: ['search', 'whoami'] }),
      ),
    ).toEqual({
      kind: 'probe',
      probe: { tool: 'whoami', arguments: {}, identity: true },
    })
  })
  it('connected without a who-am-I call: signed in when it signs in by token, else no claim', () => {
    expect(
      planConfiguredServerCheck(
        server('acme', 'connected', { tools: ['search'], authStatus: 'oAuth' }),
      ),
    ).toEqual({
      kind: 'verdict',
      verdict: { status: 'signed-in', account: null, reason: null },
    })
    expect(
      planConfiguredServerCheck(
        server('acme', 'connected', {
          tools: ['search'],
          authStatus: 'unsupported',
        }),
      ),
    ).toEqual({
      kind: 'verdict',
      verdict: { status: 'unchecked', account: null, reason: null },
    })
  })
  it('disabled or unknown state makes no claim', () => {
    for (const state of ['disabled', 'cancelled', null])
      expect(planConfiguredServerCheck(server('acme', state))).toEqual({
        kind: 'verdict',
        verdict: { status: 'unchecked', account: null, reason: null },
      })
  })
})
