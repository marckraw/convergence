import { describe, it, expect } from 'vitest'
import { deriveClaudeActivity } from './claude-code-activity.pure'

describe('deriveClaudeActivity', () => {
  it('maps text delta stream events to streaming', () => {
    expect(
      deriveClaudeActivity({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'hello' },
        },
      }),
    ).toBe('streaming')
  })

  it('ignores non-text stream deltas', () => {
    expect(
      deriveClaudeActivity({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'input_json_delta' },
        },
      }),
    ).toBe('keep')
  })

  it('maps assistant tool_use blocks to tool:name', () => {
    expect(
      deriveClaudeActivity({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Using tool' },
            { type: 'tool_use', name: 'Edit', input: {} },
          ],
        },
      }),
    ).toBe('tool:edit')
  })

  it('keeps activity when assistant has no tool blocks', () => {
    expect(
      deriveClaudeActivity({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hi' }] },
      }),
    ).toBe('keep')
  })

  it('clears activity on result', () => {
    expect(deriveClaudeActivity({ type: 'result' })).toBeNull()
  })

  it('maps PreCompact hook events to compacting', () => {
    expect(
      deriveClaudeActivity({
        type: 'system',
        hook_event_name: 'PreCompact',
      }),
    ).toBe('compacting')
  })

  it('maps compact metadata system events to compacting', () => {
    expect(
      deriveClaudeActivity({
        type: 'system',
        compact_metadata: { trigger: 'auto' },
      }),
    ).toBe('compacting')
  })

  it('maps compact subtype system events to compacting', () => {
    expect(
      deriveClaudeActivity({
        type: 'system',
        subtype: 'compact_boundary',
      }),
    ).toBe('compacting')
  })

  it('maps compaction block start to compacting', () => {
    expect(
      deriveClaudeActivity({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          content_block: { type: 'compaction' },
        },
      }),
    ).toBe('compacting')
  })

  it('maps compaction deltas to compacting', () => {
    expect(
      deriveClaudeActivity({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'compaction_delta' },
        },
      }),
    ).toBe('compacting')
  })

  it('clears compacting on PostCompact hook events', () => {
    expect(
      deriveClaudeActivity(
        {
          type: 'system',
          hook_event_name: 'PostCompact',
        },
        'compacting',
      ),
    ).toBeNull()
  })

  it('clears compacting on compaction block stop', () => {
    expect(
      deriveClaudeActivity(
        {
          type: 'stream_event',
          event: {
            type: 'content_block_stop',
          },
        },
        'compacting',
      ),
    ).toBeNull()
  })

  it('maps compact boundary system events with camelCase metadata to compacting', () => {
    expect(
      deriveClaudeActivity({
        type: 'system',
        subtype: 'compact_boundary',
        compactMetadata: { trigger: 'auto' },
      }),
    ).toBe('compacting')
  })

  it('keeps activity for unknown events', () => {
    expect(deriveClaudeActivity({ type: 'system' })).toBe('keep')
    expect(deriveClaudeActivity({})).toBe('keep')
    expect(deriveClaudeActivity(null)).toBe('keep')
  })
})
