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
      windowTokens: 200000,
      usedPercentage: 5,
      remainingPercentage: 95,
    })
  })
})
