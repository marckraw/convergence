import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CodexProvider } from '../../../electron/backend/provider/codex/codex-provider.ts'
import { CodexServerHostRegistry } from '../../../electron/backend/provider/codex/codex-server-host.ts'
import { supportsResidentCodexServer } from '../../../electron/backend/provider/codex/codex-server-host.pure.ts'
import { selectProviderVersionOutput } from '../../../electron/backend/provider/provider-status.pure.ts'
import {
  buildLunaOneShotInput,
  parseLunaEffort,
  redactForReport,
  selectCodexBinary,
} from './luna-call.pure.ts'

/**
 * Harness worker for the `luna` candidate.
 *
 * One process holds the app's Codex provider, so the resident app-server stays
 * warm across the 60 rows. Each line is a fresh `provider.oneShot` on an
 * ephemeral thread. Stdout is the JSONL contract and nothing else.
 */
const effort = parseLunaEffort(process.argv.slice(2))
const { binaryPath, version } = resolveCodexBinary()
const workingDirectory = mkdtempSync(join(tmpdir(), 'convergence-luna-'))
const hosts = new CodexServerHostRegistry({
  appVersion: null,
  cwd: workingDirectory,
})
hosts.setBinary(binaryPath, version)
const provider = new CodexProvider(hosts)
const host = hosts.get({ account: null })

const lines = createInterface({ input: process.stdin })
try {
  for await (const line of lines) {
    if (!line.trim()) continue
    const request = JSON.parse(line) as { id?: unknown; prompt?: unknown }
    const id = typeof request.id === 'string' ? request.id : ''
    const prompt = typeof request.prompt === 'string' ? request.prompt : ''
    const started = performance.now()
    try {
      if (!id || !prompt) throw new Error('Worker expected {id, prompt}')
      const result = await provider.oneShot(
        buildLunaOneShotInput({
          prompt,
          effort,
          workingDirectory,
          requestId: randomUUID(),
        }),
      )
      writeRow({
        id,
        sentence: redactForReport(result.text),
        generationMs: performance.now() - started,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeRow({
        id,
        sentence: '',
        generationMs: performance.now() - started,
        error: redactForReport(message),
      })
    }
  }
} finally {
  await host.stop()
}

function resolveCodexBinary(): {
  binaryPath: string
  version: string | null
} {
  const listed = execFileSync('which', ['-a', 'codex'], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const candidates = [...new Set(listed)].map((candidate) => ({
    binaryPath: candidate,
    version: selectProviderVersionOutput(
      execFileSync(candidate, ['--version'], {
        encoding: 'utf8',
        timeout: 5_000,
      }),
    ),
  }))
  return selectCodexBinary(candidates, supportsResidentCodexServer)
}

function writeRow(row: {
  id: string
  sentence: string
  generationMs: number
  error?: string
}): void {
  process.stdout.write(`${JSON.stringify(row)}\n`)
}
