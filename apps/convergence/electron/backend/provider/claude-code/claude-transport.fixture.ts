import { spawn } from 'child_process'
import { parseJsonLines } from '../line-parser'
import type {
  createClaudeTransport,
  ClaudeTransport,
} from './claude-transport.service'

/** Provider-unit fixture; the SDK wire is exercised by the resident service tests. */
export function createFixtureClaudeTransport(
  input: Parameters<typeof createClaudeTransport>[0],
): ClaudeTransport {
  const child = spawn(input.binaryPath, input.args, {
    cwd: input.cwd,
    env: input.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  parseJsonLines(child.stdout, input.onMessage, () => {})
  child.stderr.on('data', (data: Buffer) => input.onStderr(data.toString()))
  child.on('exit', (code, signal) => input.onExit({ code, signal }))
  child.on('error', (error) =>
    input.onExit({ code: null, signal: null, error: error.message }),
  )
  return {
    canStopTasks: true,
    write: (line) => {
      child.stdin.write(line + '\n')
    },
    stopTask: async () => {},
    interrupt: async () => ({ still_queued: [] }),
    setModel: async () => {},
    setPermissionMode: async () => {},
    close: async () => {
      child.stdin.end()
      child.kill('SIGTERM')
    },
  }
}
