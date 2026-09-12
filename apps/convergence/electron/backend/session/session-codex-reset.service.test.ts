import {
  AttachmentsService,
  DRAFT_SESSION_ID,
} from '../attachments/attachments.service'
import type { SkillSelection } from '../skills/skills.types'
import { ProviderSessionEmitter } from '../provider/provider-session.emitter'
import {
  CONTEXT_RESTARTED_NOTE_TEXT,
  SESSION_RESTARTED_EVENT_TYPE,
} from '../provider/session-restart.pure'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { ProviderRegistry } from '../provider/provider-registry'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import {
  buildFallbackCodexDescriptor,
  buildClaudeDescriptor,
} from '../provider/provider-descriptor.pure'
import type { SessionStartConfig } from '../provider/provider.types'
import type { SessionDelta } from './conversation-item.types'
import { ProjectContextService } from '../project-context/project-context.service'
import { SessionContextInjectionService } from './context-injection/session-context-injection.service'
import { SessionService } from './session.service'

const selectedSkill: SkillSelection = {
  id: 'skill-1',
  providerId: 'codex',
  providerName: 'Codex',
  name: 'review',
  displayName: 'Review',
  path: '/tmp/review/SKILL.md',
  scope: 'project',
  rawScope: null,
  sourceLabel: 'Project',
  status: 'selected',
}

/** Public session-service door: injection and queuing happen before the adapter. */
describe('Codex reset through the composer door', () => {
  let service: SessionService
  let directory: string
  let sessionId: string
  let contextId: string
  let context: ProjectContextService
  let emit: (delta: SessionDelta) => void
  let starts: SessionStartConfig[]
  let attachments: AttachmentsService
  beforeEach(() => {
    const db = getDatabase()
    directory = mkdtempSync(join(tmpdir(), 'codex-reset-'))
    mkdirSync(join(directory, '.git'))
    db.prepare(
      'INSERT INTO projects (id, name, repository_path) VALUES (?, ?, ?)',
    ).run('reset-project', 'Reset', directory)
    const registry = new ProviderRegistry()
    starts = []
    for (const providerId of ['codex', 'claude-code']) {
      registry.register({
        id: providerId,
        name: 'Codex',
        supportsContinuation: true,
        describe: async () =>
          providerId === 'codex'
            ? buildFallbackCodexDescriptor()
            : buildClaudeDescriptor(),
        start(config) {
          starts.push(config)
          return {
            onDelta: (cb) => {
              emit = cb
            },
            onStatusChange: () => {},
            onAttentionChange: () => {},
            onContinuationToken: () => {},
            onContextWindowChange: () => {},
            onActivityChange: () => {},
            sendMessage: () => {},
            approve: () => {},
            deny: () => {},
            stop: () => {},
            dispose: () => {},
          }
        },
      })
    }
    service = new SessionService(db, new LocalExecutionHost(registry))
    attachments = new AttachmentsService(db, join(directory, 'attachments'))
    service.setAttachmentsService(attachments)
    context = new ProjectContextService(db)
    service.setSessionContextInjectionService(
      new SessionContextInjectionService(db, context),
    )
    contextId = context.create({
      projectId: 'reset-project',
      label: 'always',
      body: 'injected context',
      reinjectMode: 'every-turn',
    }).id
    sessionId = service.create({
      projectId: 'reset-project',
      workspaceId: null,
      providerId: 'codex',
      name: 'same',
      model: 'gpt-6',
      effort: 'high',
    }).id
  })
  afterEach(() => {
    service.disposeAll()
    closeDatabase()
    resetDatabase()
    rmSync(directory, { recursive: true, force: true })
  })

  it('passes a resumed /clear unchanged — remove reset injection bypass turns red', async () => {
    await service.start(sessionId, {
      text: 'before',
      contextItemIds: [contextId],
    })
    emit({
      kind: 'session.patch',
      patch: { continuationToken: 'old-thread', status: 'completed' },
    })
    await service.sendMessage(sessionId, { text: '/clear' })
    expect(starts.map((config) => config.initialMessage)).toEqual([
      '<reset:context>\nalways\ninjected context\n</reset:context>\n\nbefore',
      '/clear',
    ])
  })
  it('refuses a running composer reset — remove the pre-queue reset guard turns red', async () => {
    await service.start(sessionId, {
      text: 'before',
      contextItemIds: [contextId],
    })
    emit({ kind: 'session.patch', patch: { status: 'running' } })
    await expect(
      service.sendMessage(sessionId, { text: '/clear' }),
    ).rejects.toThrow(
      'Wait for the current turn to finish before clearing the conversation.',
    )
  })

  it('leaves boot context unattached on /clear — call prepareBoot before the guard turns red', async () => {
    await service.start(sessionId, {
      text: '/clear',
      contextItemIds: [contextId],
    })
    expect(starts[0].initialMessage).toBe('/clear')
    expect(context.listForSession(sessionId)).toEqual([])
  })
  it.each(['start', 'sendMessage'] as const)(
    'refuses %s reset during cold start — gate on status instead of live handle turns red',
    async (door) => {
      await service.start(sessionId, { text: 'before' })
      // Measured: the row reads `idle` with a handle attached -- a turn is on
      // its way up and has not reported yet. That is what separates this from
      // an idle resident, whose row reads `completed` (MAR-2888 lap 2).
      // A handle exists, but it has emitted no running status yet.
      await expect(
        service[door](sessionId, { text: '/clear' }),
      ).rejects.toThrow(
        'Wait for the current turn to finish before clearing the conversation.',
      )
    },
  )

  it('queues an opener refused during cold start instead of dropping it (MAR-2888)', async () => {
    // The same gate fires — a handle exists with no running status yet, which
    // is what "gate on the live handle, not the status" means — but the
    // ANSWER differs by door, because the doors have different callers.
    // `sendMessageWithOpener` has exactly one: the relay engine. Nobody is
    // watching that moment, and the work is a baton being handed on, so the
    // refusal is answered by the queue. `sendMessage` above is the user's
    // door and stays loud, which is what keeps the gate honest.
    await service.start(sessionId, { text: 'before' })

    const receipt = await service.sendMessageWithOpener(sessionId, {
      opener: '/clear',
      text: 'payload',
    })

    expect(receipt.openerQueued).toBe(true)
    expect(
      service.getQueuedInputs(sessionId).map((item) => [item.text, item.state]),
    ).toEqual([
      ['/clear', 'queued'],
      ['payload', 'queued'],
    ])
  })

  it('refuses reset while a dispatch has no handle yet — remove the in-flight check turns red', async () => {
    const starting = service.start(sessionId, { text: 'before' })
    try {
      await expect(
        service.sendMessage(sessionId, { text: '/clear' }),
      ).rejects.toThrow(
        'Wait for the current turn to finish before clearing the conversation.',
      )
    } finally {
      await starting
    }
  })

  it.each(['attachment', 'skill'] as const)(
    'refuses a reset carrying an %s — remove reset payload refusal turns red',
    async (kind) => {
      const result = await attachments.ingestFiles(DRAFT_SESSION_ID, [
        { name: 'note.txt', bytes: new TextEncoder().encode('hello') },
      ])
      const input =
        kind === 'attachment'
          ? { attachmentIds: [result.attachments[0].id] }
          : { skillSelections: [selectedSkill] }
      await expect(
        service.start(sessionId, { text: '/clear', ...input }),
      ).rejects.toThrow(
        'A conversation reset cannot carry attachments or skill selections.',
      )
    },
  )

  it('tells the next start that nothing has run since the boundary — read the wire refusal instead turns red', async () => {
    // The fact only this side has (MAR-2854). Codex refuses to resume the empty
    // thread a `/clear` leaves behind in the same words it refuses a thread
    // whose rollout is gone, so the adapter is told which of the two it is
    // looking at rather than left to read the sentence.
    await service.start(sessionId, { text: 'before' })
    emit({
      kind: 'session.patch',
      patch: { continuationToken: 'thread-1', status: 'completed' },
    })
    await service.sendMessage(sessionId, { text: '/clear' })
    const emitter = new ProviderSessionEmitter({
      providerId: 'codex',
      emitDelta: (delta) => emit(delta),
    })
    emitter.addNote({
      text: CONTEXT_RESTARTED_NOTE_TEXT,
      level: 'warning',
      providerEventType: SESSION_RESTARTED_EVENT_TYPE,
    })
    emit({
      kind: 'session.patch',
      patch: { continuationToken: 'thread-2', status: 'completed' },
    })

    await service.sendMessage(sessionId, { text: 'after the clear' })
    const afterTheClear = starts.at(-1)

    // The adapter records the user's message, as both real ones do, and the
    // boundary now has a turn after it.
    emitter.addUserMessage({ text: 'after the clear' })
    emit({ kind: 'session.patch', patch: { status: 'completed' } })
    await service.sendMessage(sessionId, { text: 'and another' })

    expect({
      messages: starts.map((config) => config.initialMessage),
      flags: starts.map((config) => config.noTurnSinceBoundary),
      afterTheClearToken: afterTheClear?.continuationToken,
    }).toEqual({
      messages: ['before', '/clear', 'after the clear', 'and another'],
      // The reset itself is started before its own boundary exists, so it is
      // false; the message after the boundary is the true one; the message
      // after *that* is false again.
      flags: [false, false, true, false],
      afterTheClearToken: 'thread-2',
    })
  })

  it('drops unconsumed attachment and skill ids at the restart boundary — omit boundary cleanup turns red', async () => {
    const result = await attachments.ingestFiles(DRAFT_SESSION_ID, [
      { name: 'note.txt', bytes: new TextEncoder().encode('hello') },
    ])
    // Deliberately synthetic order to pin defensive cleanup: both real adapters
    // emit the user row first, so their restarted-note cleanup is normally a no-op.
    await service.start(sessionId, {
      text: 'before',
      attachmentIds: [result.attachments[0].id],
      skillSelections: [selectedSkill],
    })
    const emitter = new ProviderSessionEmitter({
      providerId: 'codex',
      emitDelta: (delta) => emit(delta),
    })
    emitter.addNote({
      text: CONTEXT_RESTARTED_NOTE_TEXT,
      level: 'warning',
      providerEventType: SESSION_RESTARTED_EVENT_TYPE,
    })
    emitter.addUserMessage({ text: 'after' })
    expect(
      service
        .getConversation(sessionId)
        .filter((item) => item.kind === 'message')
        .map((item) => ({
          text: item.text,
          attachments: item.attachmentIds ?? [],
          skills: item.skillSelections ?? [],
        })),
    ).toEqual([{ text: 'after', attachments: [], skills: [] }])
  })

  it('leaves Claude /clear unwrapped too — use the Codex id instead of reset capability turns red', async () => {
    const claude = service.create({
      projectId: 'reset-project',
      workspaceId: null,
      providerId: 'claude-code',
      name: 'Claude',
      model: 'opus',
      effort: 'high',
    })
    await service.start(claude.id, {
      text: 'before',
      contextItemIds: [contextId],
    })
    emit({
      kind: 'session.patch',
      patch: { continuationToken: 'claude-before', status: 'completed' },
    })
    await service.sendMessage(claude.id, { text: '/clear' })
    expect(starts.at(-1)?.initialMessage).toBe('/clear')
  })

  it('refuses a running Claude composer reset without queueing — queue Claude reset instead turns red', async () => {
    const claude = service.create({
      projectId: 'reset-project',
      workspaceId: null,
      providerId: 'claude-code',
      name: 'Claude',
      model: 'opus',
      effort: 'high',
    })
    await service.start(claude.id, { text: 'before' })
    emit({ kind: 'session.patch', patch: { status: 'running' } })
    const refusal = await service
      .sendMessage(claude.id, { text: '/clear' })
      .then(
        () => null,
        (error: unknown) =>
          error instanceof Error ? error.message : String(error),
      )
    expect({ refusal, queued: service.getQueuedInputs(claude.id) }).toEqual({
      refusal:
        'Wait for the current turn to finish before clearing the conversation.',
      queued: [],
    })
  })

  it('drains a queued Codex reset opener into a new handle with the prior thread — drop the completed drain turns red', async () => {
    await service.start(sessionId, {
      text: 'before',
      contextItemIds: [contextId],
    })
    emit({
      kind: 'session.patch',
      patch: { status: 'running', continuationToken: 'prior-thread' },
    })
    await service.sendMessageWithOpener(sessionId, {
      opener: '/clear',
      text: 'payload',
    })
    const beforeCompletion = {
      starts: starts.length,
      queued: service
        .getQueuedInputs(sessionId)
        .map((item) => ({ text: item.text, state: item.state })),
    }
    emit({ kind: 'session.patch', patch: { status: 'completed' } })
    expect({
      beforeCompletion,
      resumed: starts.slice(1).map((config) => ({
        text: config.initialMessage,
        thread: config.continuationToken,
      })),
      remaining: service
        .getQueuedInputs(sessionId)
        .map((item) => ({ text: item.text, state: item.state })),
    }).toEqual({
      beforeCompletion: {
        starts: 1,
        queued: [
          { text: '/clear', state: 'queued' },
          { text: 'payload', state: 'queued' },
        ],
      },
      resumed: [{ text: '/clear', thread: 'prior-thread' }],
      remaining: [{ text: 'payload', state: 'queued' }],
    })
  })
})
