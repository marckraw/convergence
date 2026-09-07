import { describe, expect, it } from 'vitest'
import {
  buildCodexOneShotThreadParams,
  buildCodexOneShotTurnParams,
  isCodexNotificationForThread,
  readCodexOneShotDelta,
  readCodexOneShotMessage,
  readCodexOneShotThreadId,
  readCodexOneShotTurnId,
  readCodexTurnOutcome,
  statesProviderAccount,
} from './codex-one-shot.pure'

const BASE = {
  prompt: 'name this session',
  modelId: 'gpt-5.6-luna',
  workingDirectory: '/tmp/project',
}

describe('buildCodexOneShotThreadParams', () => {
  it('starts an ephemeral thread — without the flag the turn leaves a rollout', () => {
    expect(buildCodexOneShotThreadParams(BASE)).toEqual({
      cwd: '/tmp/project',
      approvalPolicy: 'never',
      sandbox: 'read-only',
      ephemeral: true,
    })
  })
})

describe('buildCodexOneShotTurnParams', () => {
  it('carries the caller model and prompt', () => {
    expect(buildCodexOneShotTurnParams('thread-1', BASE)).toEqual({
      threadId: 'thread-1',
      model: 'gpt-5.6-luna',
      input: [{ type: 'text', text: 'name this session' }],
    })
  })

  it('adds effort, service tier and output schema only when the caller set them', () => {
    const schema = { type: 'object', properties: { title: { type: 'string' } } }
    expect(
      buildCodexOneShotTurnParams('thread-1', {
        ...BASE,
        effort: 'low',
        serviceTier: 'fast',
        outputSchema: schema,
      }),
    ).toEqual({
      threadId: 'thread-1',
      model: 'gpt-5.6-luna',
      effort: 'low',
      serviceTier: 'fast',
      outputSchema: schema,
      input: [{ type: 'text', text: 'name this session' }],
    })

    const bare = buildCodexOneShotTurnParams('thread-1', {
      ...BASE,
      effort: null,
      serviceTier: null,
      outputSchema: null,
    })
    expect(Object.keys(bare)).not.toContain('effort')
    expect(Object.keys(bare)).not.toContain('serviceTier')
    expect(Object.keys(bare)).not.toContain('outputSchema')
  })
})

describe('readCodexOneShotThreadId', () => {
  it('reads both shapes the server answers with, and nothing else', () => {
    expect(readCodexOneShotThreadId({ thread: { id: 'a' } })).toBe('a')
    expect(readCodexOneShotThreadId({ threadId: 'b' })).toBe('b')
    expect(readCodexOneShotThreadId({})).toBeNull()
    expect(readCodexOneShotThreadId(null)).toBeNull()
    expect(readCodexOneShotThreadId({ thread: { id: 7 } })).toBeNull()
  })
})

describe('readCodexOneShotTurnId', () => {
  it('reads the id a turn/start acknowledgement carries, and nothing else', () => {
    // Without an id the timeout path cannot interrupt, and the turn outlives
    // the call on a server every other session shares.
    expect(readCodexOneShotTurnId({ turn: { id: 'turn-1' } })).toBe('turn-1')
    expect(readCodexOneShotTurnId({ turn: {} })).toBeNull()
    expect(readCodexOneShotTurnId({ turn: { id: 7 } })).toBeNull()
    expect(readCodexOneShotTurnId({})).toBeNull()
    expect(readCodexOneShotTurnId(null)).toBeNull()
  })
})

describe('statesProviderAccount', () => {
  it('separates a caller that meant the ambient login from one that never said', () => {
    expect(statesProviderAccount({ providerAccountId: 'acct-1' })).toBe(true)
    // An explicit null is an answer: the ambient `~/.codex` login.
    expect(statesProviderAccount({ providerAccountId: null })).toBe(true)
    // A caller spreading an optional field it never filled said nothing, and
    // an absent key and an unfilled one buy the same ambient quota.
    expect(statesProviderAccount({ providerAccountId: undefined })).toBe(false)
    expect(statesProviderAccount({ prompt: 'name this' })).toBe(false)
  })
})

describe('isCodexNotificationForThread', () => {
  it('claims only events tagged with this thread', () => {
    expect(isCodexNotificationForThread({ threadId: 'mine' }, 'mine')).toBe(
      true,
    )
    expect(isCodexNotificationForThread({ threadId: 'other' }, 'mine')).toBe(
      false,
    )
    // A broadcast with no thread id belongs to nobody until proven otherwise.
    expect(isCodexNotificationForThread({}, 'mine')).toBe(false)
    expect(isCodexNotificationForThread(null, 'mine')).toBe(false)
  })
})

describe('readCodexOneShotDelta', () => {
  it('reads either delta key the server uses', () => {
    expect(readCodexOneShotDelta({ delta: 'ab' })).toBe('ab')
    expect(readCodexOneShotDelta({ textDelta: 'cd' })).toBe('cd')
    expect(readCodexOneShotDelta({ delta: 4 })).toBeNull()
  })
})

describe('readCodexOneShotMessage', () => {
  it('takes the agent message and refuses every other item type', () => {
    expect(
      readCodexOneShotMessage({ item: { type: 'agentMessage', text: 'hi' } }),
    ).toBe('hi')
    // Reasoning is not an answer: scraping it is how the old exec path once
    // returned a model's thinking as a session title.
    expect(
      readCodexOneShotMessage({ item: { type: 'reasoning', text: 'hmm' } }),
    ).toBeNull()
    expect(
      readCodexOneShotMessage({ item: { type: 'agentMessage' } }),
    ).toBeNull()
    expect(readCodexOneShotMessage({})).toBeNull()
  })
})

describe('readCodexTurnOutcome', () => {
  it('separates a completed turn from a failed one and quotes the reason', () => {
    expect(readCodexTurnOutcome({ turn: { status: 'completed' } })).toEqual({
      completed: true,
      reason: 'completed',
    })
    expect(
      readCodexTurnOutcome({
        turn: { status: 'failed', error: { message: 'rate limited' } },
      }),
    ).toEqual({ completed: false, reason: 'rate limited' })
    expect(readCodexTurnOutcome({ turn: { status: 'aborted' } })).toEqual({
      completed: false,
      reason: 'aborted',
    })
    expect(readCodexTurnOutcome({})).toBeNull()
  })
})
