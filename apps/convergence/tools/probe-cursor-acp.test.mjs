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
import { test } from 'node:test'
import {
  buildCancelNotification,
  buildPermissionResponse,
  buildPromptRequest,
  buildRequestMessage,
  createTranscript,
  parseArgs,
  redactPayload,
  selectPermissionOptionId,
} from './probe-cursor-acp.pure.mjs'

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
