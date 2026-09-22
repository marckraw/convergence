import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, expect, it, vi } from 'vitest'

const { spawnMock, readLog } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  readLog: vi.fn(),
}))
vi.mock('child_process', () => ({ spawn: spawnMock }))
vi.mock('./claude-transport.service', async () => ({
  createClaudeTransport: (await import('./claude-transport.fixture'))
    .createFixtureClaudeTransport,
}))
vi.mock('./claude-context-log.service', () => ({
  readClaudeLoggedContextWindow: readLog,
}))
vi.mock('./claude-skill-telemetry.service', () => ({
  startClaudeSkillTelemetrySink: async () => null,
}))
// No account metadata, skill directories or personal logs are read by this fixture.
vi.mock('fs/promises', () => ({
  readdir: async () => [],
  readFile: async () => '',
}))
import { ClaudeCodeProvider } from './claude-code-provider'

class FakeChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn(() => true)
}
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.clearAllMocks()
})
async function fixture() {
  const child = new FakeChild()
  spawnMock.mockReturnValue(child)
  readLog.mockReturnValue({
    availability: 'available',
    source: 'estimated',
    usedPercentage: 10,
    remainingPercentage: 90,
    usedTokens: 10000,
    windowTokens: 100000,
  })
  const handle = new ClaudeCodeProvider('/fixture/claude').start({
    sessionId: 'fixture',
    workingDirectory: '/fixture',
    initialMessage: 'hello',
    model: null,
    effort: null,
    continuationToken: 'fixture-thread',
  })
  cleanups.push(() => handle.dispose?.())
  const sequence: string[] = []
  handle.onContextWindowChange?.((context) => {
    if (context.availability !== 'unavailable')
      sequence.push(`context:${context.usedPercentage}`)
  })
  handle.onStatusChange((status) => {
    if (status === 'completed') sequence.push(status)
  })
  await vi.waitUntil(() => child.stdin.readableLength > 0)
  child.stdin.read()
  return {
    handle,
    child,
    sequence,
    result: (stream: boolean) =>
      child.stdout.write(
        JSON.stringify({
          type: 'result',
          result: 'answer',
          ...(stream
            ? {
                context_window: {
                  used_percentage: 90,
                  remaining_percentage: 10,
                  used_tokens: 90000,
                  window_size_tokens: 100000,
                },
              }
            : {}),
        }) + '\n',
      ),
  }
}
it('stream 90 wins over log 10 before completed', async () => {
  const bed = await fixture()
  bed.result(true)
  expect(bed.sequence).toEqual(['context:90', 'completed'])
  expect(readLog).not.toHaveBeenCalled()
})
it('log 10 fills silence before completed', async () => {
  const bed = await fixture()
  bed.result(false)
  expect(bed.sequence).toEqual(['context:10', 'completed'])
})
it('resets freshness for a second turn without stream usage', async () => {
  const bed = await fixture()
  bed.result(true)
  await bed.handle.sendMessage('second')
  bed.result(false)
  expect(bed.sequence).toEqual([
    'context:90',
    'completed',
    'context:10',
    'completed',
  ])
  expect(readLog).toHaveBeenCalledTimes(1)
})
