import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  readClaudeLoggedContextWindow,
  toClaudeProjectsKey,
} from './claude-context-log.service'

describe('claude-context-log.service', () => {
  it('derives an estimated context window from Claude session logs', () => {
    const projectsRoot = mkdtempSync(join(tmpdir(), 'convergence-claude-log-'))
    const workingDirectory = '/Users/marckraw/Projects/Private/convergence'
    const sessionId = 'session-123'
    const projectDir = join(projectsRoot, toClaudeProjectsKey(workingDirectory))
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, `${sessionId}.jsonl`),
      [
        JSON.stringify({ type: 'system', session_id: sessionId }),
        JSON.stringify({
          type: 'assistant',
          message: {
            model: 'claude-opus-4-6',
            usage: {
              input_tokens: 1200,
              cache_creation_input_tokens: 300,
              cache_read_input_tokens: 8500,
            },
          },
        }),
      ].join('\n'),
    )

    expect(
      readClaudeLoggedContextWindow({
        sessionId,
        workingDirectory,
        fallbackModel: 'opus',
        projectsRoot,
      }),
    ).toEqual({
      availability: 'available',
      source: 'estimated',
      usedTokens: 10000,
      windowTokens: 1_000_000,
      usedPercentage: 1,
      remainingPercentage: 99,
    })
  })

  it("returns the main thread's last request, not a subagent's or the turn's sum", () => {
    const projectsRoot = mkdtempSync(join(tmpdir(), 'convergence-claude-log-'))
    const workingDirectory = '/Users/marckraw/Projects/Private/convergence'
    const sessionId = 'session-456'
    const projectDir = join(projectsRoot, toClaudeProjectsKey(workingDirectory))
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, `${sessionId}.jsonl`),
      [
        JSON.stringify({ type: 'system', session_id: sessionId }),
        // The main thread's last request: 32 + 4,127 + 120,863 = 125,022.
        JSON.stringify({
          type: 'assistant',
          parent_tool_use_id: null,
          message: {
            model: 'claude-opus-5',
            usage: {
              input_tokens: 32,
              cache_creation_input_tokens: 4_127,
              cache_read_input_tokens: 120_863,
            },
          },
        }),
        // A Task subagent's request with a LARGER context (400,012).
        JSON.stringify({
          type: 'assistant',
          parent_tool_use_id: 'toolu_task_1',
          message: {
            model: 'claude-opus-5',
            usage: {
              input_tokens: 12,
              cache_creation_input_tokens: 20_000,
              cache_read_input_tokens: 380_000,
            },
          },
        }),
        // The turn's summed usage over every request (1,062,462).
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          usage: {
            input_tokens: 354,
            cache_creation_input_tokens: 43_072,
            cache_read_input_tokens: 1_019_036,
          },
        }),
      ].join('\n'),
    )

    expect(
      readClaudeLoggedContextWindow({
        sessionId,
        workingDirectory,
        fallbackModel: 'fable',
        projectsRoot,
      }),
    ).toEqual({
      availability: 'available',
      source: 'estimated',
      usedTokens: 125_022,
      windowTokens: 1_000_000,
      usedPercentage: 13,
      remainingPercentage: 87,
    })
  })
})
