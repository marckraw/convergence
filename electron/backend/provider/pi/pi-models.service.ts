import { spawn } from 'child_process'
import { PiRpcClient } from './pi-rpc'
import { needsShellForSpawn } from '../shell-exec.pure'

const PROBE_TIMEOUT_MS = 5000

export async function probePiAvailableModels(
  binaryPath: string,
): Promise<unknown[]> {
  const child = spawn(binaryPath, ['--mode', 'rpc', '--no-session'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    shell: needsShellForSpawn(binaryPath, process.platform),
  })

  const spawnFailure = new Promise<never>((_, reject) => {
    child.once('error', reject)
  })

  if (!child.stdin || !child.stdout) {
    child.kill('SIGTERM')
    return []
  }

  if (child.stderr) {
    child.stderr.on('data', () => {
      // Drain to prevent blocking.
    })
  }

  const rpc = new PiRpcClient(child.stdin, child.stdout)

  let timeoutHandle: NodeJS.Timeout | null = null
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error('probePiAvailableModels timed out'))
    }, PROBE_TIMEOUT_MS)
  })

  try {
    const response = await Promise.race([
      rpc.request({ type: 'get_available_models' }),
      timeout,
      spawnFailure,
    ])
    if (!response.success) return []
    const data = response.data as { models?: unknown } | null
    return Array.isArray(data?.models) ? data.models : []
  } catch {
    return []
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    rpc.destroy()
    try {
      child.kill('SIGTERM')
    } catch {
      // Already exited or failed to spawn
    }
  }
}
