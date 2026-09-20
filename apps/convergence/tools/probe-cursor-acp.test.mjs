/**
 * Tests for the side-effect-free half of the Cursor ACP probe.
 *
 * Imports ONLY `probe-cursor-acp.pure.mjs`. Importing `probe-cursor-acp.mjs`
 * would spawn a real `cursor-agent` and spend Marcin's Cursor plan.
 *
 * No gate runs this file (`vitest.pure.config.ts` covers no `tools/**`), the
 * same as its neighbour `codex-account-canary-preflight.test.mjs`. Run it by
 * hand: `node --test apps/convergence/tools/probe-cursor-acp.test.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  buildCancelNotification,
  buildGuardTranscriptEntry,
  buildPermissionResponse,
  buildPromptRequest,
  buildRequestMessage,
  countGuardedAnswers,
  createTranscript,
  decidePermissionAnswer,
  parseArgs,
  redactPayload,
  selectPermissionOptionId,
} from './probe-cursor-acp.pure.mjs'
import { CURSOR_ACP_RECORDED_PERMISSION_REQUEST_PARAMS } from '../electron/backend/provider/cursor/cursor-acp.recorded.fixture.ts'

test('session/cancel is built as a notification with no id', () => {
  const message = buildCancelNotification('session-abc')

  assert.equal('id' in message, false)
  assert.deepEqual(message, {
    jsonrpc: '2.0',
    method: 'session/cancel',
    params: { sessionId: 'session-abc' },
  })
})

test('a request, unlike the cancel notification, does carry an id', () => {
  const message = buildRequestMessage(7, 'session/new', { cwd: '/tmp/x' })

  assert.equal(message.id, 7)
  assert.equal(message.method, 'session/new')
})

test('--prompt is repeatable and keeps order', () => {
  const args = parseArgs([
    '--prompt',
    'first',
    '--idle-ms',
    '250',
    '--linger-ms',
    '4000',
    '--prompt',
    'second',
    '--out',
    '/tmp/transcript.json',
  ])

  assert.deepEqual(args.prompts, ['first', 'second'])
  assert.equal(args.idleMs, 250)
  assert.equal(args.lingerMs, 4000)
  assert.equal(args.out, '/tmp/transcript.json')
})

test('a prompt request carries the session and one text block', () => {
  assert.deepEqual(buildPromptRequest(3, 'sid', 'hello'), {
    jsonrpc: '2.0',
    id: 3,
    method: 'session/prompt',
    params: { sessionId: 'sid', prompt: [{ type: 'text', text: 'hello' }] },
  })
})

test('first-allow picks the first offered option whose kind allows', () => {
  const options = [
    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
    { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'allow-always', name: 'Always allow', kind: 'allow_always' },
  ]

  assert.deepEqual(selectPermissionOptionId(options, 'first-allow'), {
    optionId: 'allow-once',
    reason: 'first-allow:allow_once',
  })
})

test('first-allow answers cancelled when no allowing option is offered', () => {
  const selected = selectPermissionOptionId(
    [{ optionId: 'reject-once', kind: 'reject_once' }],
    'first-allow',
  )

  assert.equal(selected.optionId, null)
  assert.deepEqual(buildPermissionResponse(1, selected.optionId).result, {
    outcome: { outcome: 'cancelled' },
  })
})

test('any other --permission-response value is echoed back as an option id', () => {
  assert.deepEqual(selectPermissionOptionId([], 'reject-once'), {
    optionId: 'reject-once',
    reason: 'configured-option-id',
  })
})

const SENSITIVE_PAYLOAD = {
  sessionUpdate: 'tool_call_update',
  detail: {
    note: 'signed in as probe.person@example.com',
    workspace: '/Users/probeuser/Projects/secret-app/src',
    nested: {
      // token-shaped, but under an innocent key: key-based redaction misses it
      bearer: 'Ab3xQ9zK2mN7pL4vR8tY6wS1dF5gH0jC3bV9nM2kX7qZ',
    },
  },
}

test('redaction removes an email, a home path and a token-shaped string', () => {
  const redacted = redactPayload(SENSITIVE_PAYLOAD, {
    homeDir: '/Users/probeuser',
  })
  const serialized = JSON.stringify(redacted)

  assert.equal(serialized.includes('probe.person@example.com'), false)
  assert.equal(serialized.includes('/Users/probeuser'), false)
  assert.equal(
    serialized.includes('Ab3xQ9zK2mN7pL4vR8tY6wS1dF5gH0jC3bV9nM2kX7qZ'),
    false,
  )

  assert.equal(redacted.detail.note, 'signed in as [redacted-email]')
  assert.equal(redacted.detail.workspace, '~/Projects/secret-app/src')
  assert.equal(redacted.detail.nested.bearer, '[redacted-token]')
  assert.equal(redacted.sessionUpdate, 'tool_call_update')
})

test('the transcript redacts on append, so it can never hold a raw payload', () => {
  const transcript = createTranscript({ homeDir: '/Users/probeuser' })
  transcript.record({ at: 12, direction: 'in', message: SENSITIVE_PAYLOAD })

  const serialized = JSON.stringify(transcript.entries())

  assert.equal(transcript.length, 1)
  assert.equal(serialized.includes('probe.person@example.com'), false)
  assert.equal(serialized.includes('/Users/probeuser'), false)
  assert.equal(
    serialized.includes('Ab3xQ9zK2mN7pL4vR8tY6wS1dF5gH0jC3bV9nM2kX7qZ'),
    false,
  )
  assert.equal(transcript.entries()[0].at, 12)
  assert.equal(transcript.entries()[0].direction, 'in')
})

test('a numeric flag refuses a non-number instead of silently becoming NaN', () => {
  assert.throws(
    () => parseArgs(['--idle-ms', 'soon']),
    /--idle-ms requires a non-negative number/,
  )
})

test('the recorded permission options offer an allow-always', () => {
  // Shape measured on CLI 2026.06.03-0bbb28e, MAR-3239 probe 2.
  const offered = [
    { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
  ]

  assert.deepEqual(selectPermissionOptionId(offered, 'allow-always'), {
    optionId: 'allow-always',
    reason: 'configured-option-id',
  })
})

// --- the permission path guard (MAR-3246) -------------------------------------

/**
 * The real shape, read-only, so the guard is tested against what the wire sent
 * and not against a shape we imagined. Cloned per test because each case bends
 * one field of it.
 */
function recordedRequest(mutate) {
  const request = structuredClone(CURSOR_ACP_RECORDED_PERMISSION_REQUEST_PARAMS)
  mutate?.(request)
  return request
}

/** Put `text` where probe 2 put the command segments: the content block. */
function withContentText(text) {
  return recordedRequest((request) => {
    request.toolCall.content[0].content.text = text
  })
}

test('the recorded harmless request is allowed, and says it was not guarded', () => {
  const decision = decidePermissionAnswer(recordedRequest(), 'first-allow', {
    homeDir: '/Users/probeuser',
  })

  assert.equal(decision.optionId, 'allow-once')
  assert.equal(decision.guarded, null)
  assert.equal(decision.reason, 'first-allow:allow_once')
  assert.equal(decision.toolTitle, '`sleep 1 && echo a && sleep 1 && echo b`')
})

test('a request naming ~/.cursor is refused even under first-allow', () => {
  const decision = decidePermissionAnswer(
    withContentText('Not in allowlist: ls ~/.cursor'),
    'first-allow',
    { homeDir: '/Users/probeuser' },
  )

  assert.equal(decision.guarded, '~/.cursor')
  assert.equal(decision.optionId, 'reject-once')
  assert.equal(decision.reason, 'guarded:~/.cursor')
})

test('the guard reads rawInput at any depth, not just the content block', () => {
  const request = recordedRequest((entry) => {
    entry.toolCall.rawInput = {
      command: { parts: { target: '/Users/x/.claude/skills' } },
    }
  })

  const decision = decidePermissionAnswer(request, 'first-allow', {
    homeDir: '/Users/x',
  })

  // `~/.claude`, not `.claude`: homeDir folded the absolute path back to home.
  assert.equal(decision.guarded, '~/.claude')
  assert.equal(decision.optionId, 'reject-once')
})

test('the guard reads the tool title too', () => {
  const request = recordedRequest((entry) => {
    entry.toolCall.title = '`cat $HOME/.codex/auth.json`'
  })

  const decision = decidePermissionAnswer(request, 'first-allow', {
    homeDir: '/Users/probeuser',
  })

  assert.equal(decision.guarded, '~/.codex')
  assert.equal(decision.optionId, 'reject-once')
})

test('a dotenv path segment is refused', () => {
  const decision = decidePermissionAnswer(
    withContentText('Not in allowlist: cat .env.local'),
    'first-allow',
    { homeDir: '/Users/probeuser' },
  )

  assert.equal(decision.guarded, '.env')
  assert.equal(decision.optionId, 'reject-once')
})

test('a harmless name that merely contains the letters is still allowed', () => {
  // `environment.md` holds "env"; `import.meta.env` holds ".env". Neither is a
  // dotenv path segment. Matching either as a bare substring turns this red.
  for (const text of [
    'Not in allowlist: cat environment.md',
    'Not in allowlist: grep -rn import.meta.env src',
    'Not in allowlist: cat config.env.example.md',
  ]) {
    const decision = decidePermissionAnswer(
      withContentText(text),
      'first-allow',
      {
        homeDir: '/Users/probeuser',
      },
    )

    assert.equal(decision.guarded, null, text)
    assert.equal(decision.optionId, 'allow-once', text)
  }
})

test('every fenced pattern is refused, case-insensitively', () => {
  const cases = [
    ['ls ~/.cursor/cli-config.json', '~/.cursor'],
    ['ls ~/.CLAUDE/skills', '~/.claude'],
    ['ls ${HOME}/.codex', '~/.codex'],
    ['ls /Users/probeuser/.convergence/provider-accounts', '~/.convergence'],
    ['ls .cursor', '.cursor'],
    ['cat .env', '.env'],
    ['cat .env.production', '.env'],
    ['ls ~/.ssh', '.ssh'],
    ['cat ~/.aws/config', '.aws'],
    ['cat .npmrc', '.npmrc'],
    ['cat .netrc', '.netrc'],
    ['cat /tmp/auth.json', 'auth.json'],
    ['cat ~/Library/Application Support/app/Credentials', 'credentials'],
    ['security dump-keychain', 'Keychain'],
    ['security  find-generic-password -s cursor', 'security find-'],
  ]

  for (const [text, pattern] of cases) {
    const decision = decidePermissionAnswer(
      withContentText(`Not in allowlist: ${text}`),
      'first-allow',
      { homeDir: '/Users/probeuser' },
    )

    assert.equal(decision.guarded, pattern, text)
    assert.equal(decision.optionId, 'reject-once', text)
  }
})

test('the guard outranks an explicit --permission-response allow-always', () => {
  const decision = decidePermissionAnswer(
    withContentText('Not in allowlist: ls ~/.claude'),
    'allow-always',
    { homeDir: '/Users/probeuser' },
  )

  assert.equal(decision.guarded, '~/.claude')
  assert.equal(decision.optionId, 'reject-once')
})

test('a guarded request with no reject option answers cancelled', () => {
  const request = recordedRequest((entry) => {
    entry.toolCall.content[0].content.text = 'Not in allowlist: ls ~/.cursor'
    entry.options = [
      { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
    ]
  })

  const decision = decidePermissionAnswer(request, 'first-allow', {
    homeDir: '/Users/probeuser',
  })

  assert.equal(decision.guarded, '~/.cursor')
  assert.equal(decision.optionId, null)
  assert.deepEqual(buildPermissionResponse(9, decision.optionId).result, {
    outcome: { outcome: 'cancelled' },
  })
})

test('the reject option is found by kind, not by a hardcoded id', () => {
  const request = recordedRequest((entry) => {
    entry.toolCall.content[0].content.text = 'Not in allowlist: ls ~/.cursor'
    entry.options = [
      { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'deny-5f2a', name: 'Reject', kind: 'reject_once' },
    ]
  })

  const decision = decidePermissionAnswer(request, 'first-allow', {
    homeDir: '/Users/probeuser',
  })

  assert.equal(decision.optionId, 'deny-5f2a')
})

/**
 * A fence denies what it cannot read (MAR-3246 lap 2). The three shapes below
 * were each ALLOWED by lap 1, which searched only under `toolCall` and treated
 * a missing tool call as nothing to guard. They carry the recorded `options`,
 * so the refusal is answered with the option id the wire really offers.
 */
test('a request with no tool call at all is refused as unreadable', () => {
  // Nothing anywhere in these params matches a pattern; the ONLY ground for
  // refusing is that there is no tool call to weigh.
  const request = recordedRequest((entry) => {
    delete entry.toolCall
  })

  const decision = decidePermissionAnswer(request, 'first-allow', {
    homeDir: '/Users/probeuser',
  })

  assert.equal(decision.guarded, 'unreadable-request')
  assert.equal(decision.reason, 'guarded:unreadable-request')
  assert.equal(decision.optionId, 'reject-once')
})

test('a tool call that arrived as a string is refused, not searched past', () => {
  const request = recordedRequest((entry) => {
    entry.toolCall = 'ls ~/.cursor'
  })

  const decision = decidePermissionAnswer(request, 'first-allow', {
    homeDir: '/Users/probeuser',
  })

  // Both grounds hold here: the string is not a tool call object (unreadable)
  // AND it names a fenced folder. The match wins, because a refusal that can
  // name the pattern it caught is worth more in the transcript than one that
  // can only say the shape was wrong. Either way it is never an allow.
  assert.equal(decision.guarded, '~/.cursor')
  assert.equal(decision.optionId, 'reject-once')
})

test('a fenced path beside the tool call is refused, not only one inside it', () => {
  // The tool call itself is a perfectly readable object and names nothing;
  // the path sits next to it in the params.
  const request = recordedRequest((entry) => {
    entry.toolCall = { title: 'x' }
    entry.note = 'cat ~/.claude/a'
  })

  const decision = decidePermissionAnswer(request, 'first-allow', {
    homeDir: '/Users/probeuser',
  })

  assert.equal(decision.guarded, '~/.claude')
  assert.equal(decision.optionId, 'reject-once')
})

test('the whole JSON-RPC message is unwrapped, so no caller can slip past', () => {
  const message = {
    jsonrpc: '2.0',
    id: 4,
    method: 'session/request_permission',
    params: withContentText('Not in allowlist: ls ~/.cursor'),
  }

  const decision = decidePermissionAnswer(message, 'first-allow', {
    homeDir: '/Users/probeuser',
  })

  assert.equal(decision.guarded, '~/.cursor')
  assert.equal(decision.optionId, 'reject-once')
})

test('the guard entry reaches the transcript, scrubbed like every other entry', () => {
  const decision = decidePermissionAnswer(
    recordedRequest((entry) => {
      entry.toolCall.title = '`ls /Users/probeuser/.cursor`'
    }),
    'first-allow',
    { homeDir: '/Users/probeuser' },
  )
  const transcript = createTranscript({ homeDir: '/Users/probeuser' })

  transcript.record({
    at: 42,
    direction: 'event',
    message: buildGuardTranscriptEntry(decision),
  })

  assert.deepEqual(transcript.entries()[0].message, {
    kind: 'guard',
    pattern: '~/.cursor',
    toolTitle: '`ls ~/.cursor`',
  })
  assert.equal(
    JSON.stringify(transcript.entries()).includes('/Users/probeuser'),
    false,
  )
})

test('the summary counts only the answers the guard refused', () => {
  assert.equal(
    countGuardedAnswers([
      { optionId: 'allow-once', guarded: null },
      { optionId: 'reject-once', guarded: '~/.cursor' },
      { optionId: 'reject-once', guarded: '.env' },
    ]),
    2,
  )
  assert.equal(countGuardedAnswers(undefined), 0)
})

/**
 * The class pin. R1 is worth nothing if the tool grows a second place that
 * answers a permission request directly, so this reads the tool's source text
 * (reading is not importing — importing would spawn `cursor-agent`) and holds
 * `buildPermissionResponse(` to exactly one call site, fed by the decision.
 */
test('the tool answers permissions in exactly one guarded place', () => {
  const source = readFileSync(
    new URL('./probe-cursor-acp.mjs', import.meta.url),
    'utf8',
  )
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

  const callSites = code.match(/buildPermissionResponse\s*\(/g) ?? []

  assert.equal(callSites.length, 1, 'exactly one answering site')
  assert.match(
    code,
    /send\(\s*buildPermissionResponse\(\s*message\.id\s*,\s*decision\.optionId\s*,?\s*\)\s*,?\s*\)/,
    'the one answer is the decision it was given',
  )
  assert.match(code, /decidePermissionAnswer\(/, 'the decision is R1')
  assert.match(
    code,
    /buildGuardTranscriptEntry\(\s*decision\s*\)/,
    'a refusal reaches the transcript',
  )
  assert.match(
    code,
    /guarded:\s*decision\.guarded/,
    'the answer log carries the verdict',
  )
  assert.match(code, /countGuardedAnswers\(/, 'the summary counts refusals')
  assert.equal(
    /--[a-z-]*guard/.test(code),
    false,
    'no flag switches the guard off',
  )
})
