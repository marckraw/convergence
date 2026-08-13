import { describe, expect, it } from 'vitest'
import { formatSessionCardActivity } from './session-card-activity.pure'

describe('formatSessionCardActivity', () => {
  it('renders every ActivitySignal variant in the room voice', () => {
    expect(
      formatSessionCardActivity({ activity: 'streaming', status: 'running' }),
    ).toBe('writing response…')
    expect(
      formatSessionCardActivity({ activity: 'thinking', status: 'running' }),
    ).toBe('thinking…')
    expect(
      formatSessionCardActivity({ activity: 'compacting', status: 'running' }),
    ).toBe('compacting context…')
    expect(
      formatSessionCardActivity({
        activity: 'waiting-approval',
        status: 'running',
      }),
    ).toBe('waiting for approval')
  })

  it('extracts the tool name from a tool: signal', () => {
    expect(
      formatSessionCardActivity({ activity: 'tool:Bash', status: 'running' }),
    ).toBe('running tool: Bash')
    expect(
      formatSessionCardActivity({
        activity: 'tool:Read file',
        status: 'running',
      }),
    ).toBe('running tool: Read file')
  })

  it('falls back to a bare label when a tool: signal carries no name', () => {
    expect(
      formatSessionCardActivity({ activity: 'tool:', status: 'running' }),
    ).toBe('running tool')
    expect(
      formatSessionCardActivity({ activity: 'tool:   ', status: 'running' }),
    ).toBe('running tool')
  })

  it('says the agent is working when it runs without a finer signal', () => {
    expect(
      formatSessionCardActivity({ activity: null, status: 'running' }),
    ).toBe('working…')
    expect(
      formatSessionCardActivity({ activity: undefined, status: 'running' }),
    ).toBe('working…')
  })

  it('falls back to status for sessions that are not running', () => {
    expect(formatSessionCardActivity({ activity: null, status: 'idle' })).toBe(
      'idle',
    )
    expect(
      formatSessionCardActivity({ activity: null, status: 'completed' }),
    ).toBe('finished')
    expect(
      formatSessionCardActivity({ activity: null, status: 'failed' }),
    ).toBe('failed')
  })

  it('prefers a live activity signal over a stale status', () => {
    // A summary can carry an activity while the status row still says idle;
    // the live signal is the more honest thing to show on the card.
    expect(
      formatSessionCardActivity({ activity: 'tool:Grep', status: 'idle' }),
    ).toBe('running tool: Grep')
  })
})
