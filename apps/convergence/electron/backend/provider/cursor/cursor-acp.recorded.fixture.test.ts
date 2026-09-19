import { describe, expect, it } from 'vitest'
import { buildCursorAcpInitializeParams } from './cursor-acp-client'
import { CURSOR_ACP_SESSION_UPDATES } from './cursor-acp-contract.pure'
import {
  CURSOR_ACP_CP0_UPDATE_TODOS_ON_PLAN_PROMPT_OBSERVED,
  CURSOR_ACP_PROBE_2_META,
  CURSOR_ACP_RECORDED_CANCEL_REQUEST_ERROR,
  CURSOR_ACP_RECORDED_COMPRESS_IN_COMMAND_CATALOG,
  CURSOR_ACP_RECORDED_COMPRESS_PROMPT_RESULT,
  CURSOR_ACP_RECORDED_INITIALIZE_RESULT,
  CURSOR_ACP_RECORDED_PERMISSION_OPTION_IDS,
  CURSOR_ACP_RECORDED_PERMISSION_REQUEST_PARAMS,
  CURSOR_ACP_RECORDED_SESSION_UPDATE_KINDS,
  CURSOR_ACP_RECORDED_STATUS_SHAPE,
  CURSOR_ACP_RECORDED_TASK_REQUEST,
  CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST,
  CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST,
} from './cursor-acp.recorded.fixture'

describe('cursor ACP recorded fixture vs contract', () => {
  it('pins the recorded update-kind gap until CP3 closes it', () => {
    const appKinds = new Set<string>(CURSOR_ACP_SESSION_UPDATES)
    const gap = CURSOR_ACP_RECORDED_SESSION_UPDATE_KINDS.filter(
      (kind) => !appKinds.has(kind),
    )

    expect(gap).toEqual(['user_message_chunk'])
  })

  it('matches the initialize protocolVersion the app sends', () => {
    expect(CURSOR_ACP_RECORDED_INITIALIZE_RESULT.protocolVersion).toBe(
      buildCursorAcpInitializeParams().protocolVersion,
    )
  })

  it('records cancel-as-request as JSON-RPC method-not-found', () => {
    expect(CURSOR_ACP_RECORDED_CANCEL_REQUEST_ERROR.code).toBe(-32601)
  })
})

describe('cursor ACP probe-2 recorded samples (MAR-3239)', () => {
  it('pins the permission option ids, allow-always among them', () => {
    expect(CURSOR_ACP_RECORDED_PERMISSION_OPTION_IDS).toEqual([
      'allow-once',
      'allow-always',
      'reject-once',
    ])
  })

  it('keeps the option ids in the request sample and the id list in step', () => {
    expect(
      CURSOR_ACP_RECORDED_PERMISSION_REQUEST_PARAMS.options.map(
        (option) => option.optionId,
      ),
    ).toEqual([...CURSOR_ACP_RECORDED_PERMISSION_OPTION_IDS])
  })

  it('pins the /compress result as an ordinary end_turn, not a compaction', () => {
    expect(CURSOR_ACP_RECORDED_COMPRESS_PROMPT_RESULT.stopReason).toBe(
      'end_turn',
    )
    expect(CURSOR_ACP_RECORDED_COMPRESS_IN_COMMAND_CATALOG).toBe(false)
  })

  it('pins that a merge:true todos payload is a delta, not the whole list', () => {
    expect(CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST.merge).toBe(false)
    expect(CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST.merge).toBe(true)
    expect(
      CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST.todos.length,
    ).toBeLessThan(CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST.todos.length)
  })

  it('pins the cursor/task sample as a completion record', () => {
    expect(CURSOR_ACP_RECORDED_TASK_REQUEST.durationMs).toBeGreaterThan(0)
    expect(CURSOR_ACP_RECORDED_TASK_REQUEST.model).toBe('default')
  })

  it('records that probe 2 did not reproduce the dying turn in three attempts', () => {
    expect(CURSOR_ACP_PROBE_2_META.dyingTurnReproducedInThreeAttempts).toBe(
      false,
    )
    expect(CURSOR_ACP_PROBE_2_META.dyingTurnAttempts).toBe(3)
    expect(CURSOR_ACP_PROBE_2_META.promptsSent).toBeLessThanOrEqual(
      CURSOR_ACP_PROBE_2_META.promptCeiling,
    )
  })

  it('keeps CP0 scoped: no todos on a plan prompt, todos on a todo prompt', () => {
    expect(CURSOR_ACP_CP0_UPDATE_TODOS_ON_PLAN_PROMPT_OBSERVED).toBe(false)
    expect(CURSOR_ACP_PROBE_2_META.updateTodosObserved).toBe(true)
  })

  it('pins the status shape without an account identifier', () => {
    expect(CURSOR_ACP_RECORDED_STATUS_SHAPE.exitCode).toBe(0)
    expect(CURSOR_ACP_RECORDED_STATUS_SHAPE.stdoutTemplate).not.toMatch(/@/)
  })
})
