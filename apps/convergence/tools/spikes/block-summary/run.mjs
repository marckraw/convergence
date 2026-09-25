import { execFileSync, spawn } from 'node:child_process'
import { loadavg } from 'node:os'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { truthCheck } from './truth-check.pure.ts'
import {
  isLunaEffort,
  LUNA_MODEL_ID,
  LUNA_ONE_SHOT_TIMEOUT_MS,
} from './luna-call.pure.ts'

const root = fileURLToPath(new URL('.', import.meta.url))
const candidate = process.argv[2]
const effort = candidate === 'luna' ? process.argv[4] : null
if (candidate === 'luna') {
  if (process.argv[3] !== '--effort' || !isLunaEffort(effort ?? undefined))
    throw new Error('Usage: node run.mjs luna --effort low|medium|high')
} else if (!['apple', 'mlx'].includes(candidate)) {
  throw new Error(
    'Usage: node run.mjs apple|mlx | node run.mjs luna --effort low|medium|high',
  )
}
const reportId = effort ? `luna-${effort}` : candidate
const fixtureText = readFileSync(`${root}fixtures.json`, 'utf8')
const fixtures = JSON.parse(fixtureText)
const prompt = readFileSync(
  new URL(
    '../../../electron/backend/block-sentence/block-sentence.prompt.txt',
    import.meta.url,
  ),
  'utf8',
)
if (candidate === 'luna') {
  mkdirSync(`${root}scratch`, { recursive: true })
  buildSync({
    entryPoints: [`${root}luna-runtime.ts`],
    outfile: `${root}scratch/luna-runtime.mjs`,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'warning',
  })
}
const command =
  candidate === 'apple'
    ? [`${root}apple-fm/.build/release/apple-fm`]
    : candidate === 'mlx'
      ? [`${root}.venv/bin/python`, '-u', `${root}mlx-worker.py`]
      : [
          process.execPath,
          `${root}scratch/luna-runtime.mjs`,
          '--effort',
          effort,
        ]
mkdirSync(`${root}reports`, { recursive: true })
const host = {
  macOS: execFileSync('/usr/bin/sw_vers', ['-productVersion'], {
    encoding: 'utf8',
  }).trim(),
  build: execFileSync('/usr/bin/sw_vers', ['-buildVersion'], {
    encoding: 'utf8',
  }).trim(),
  hardware: execFileSync('/usr/sbin/sysctl', ['-n', 'hw.model'], {
    encoding: 'utf8',
  }).trim(),
  memoryBytes: Number(
    execFileSync('/usr/sbin/sysctl', ['-n', 'hw.memsize'], {
      encoding: 'utf8',
    }).trim(),
  ),
  node: process.version,
  loadAverageAtStart: loadavg(),
}
const started = performance.now()
const child = spawn('/usr/bin/time', ['-l', ...command], {
  cwd: root,
  detached: true,
  stdio: ['pipe', 'pipe', 'pipe'],
})
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
let stderr = ''
child.stderr.on('data', (data) => {
  stderr += data
})
const exited = new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('close', (code, signal) => resolve({ code, signal }))
})
// Bound a hung worker and retain completed rows; time's child shares this process group.
const rows = []
let fatal = null
try {
  for (let run = 1; run <= 3; run++) {
    for (const block of fixtures) {
      const id = `${block.id}/run-${run}`
      const requestStart = performance.now()
      child.stdin.write(
        `${JSON.stringify({ id, prompt: `${prompt}\n${JSON.stringify({ provider: block.provider, items: block.items })}` })}\n`,
      )
      let timeout
      const line = await Promise.race([
        lines.next(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Timeout: ${id}`)),
            120_000,
          )
        }),
      ]).finally(() => clearTimeout(timeout))
      if (line.done) throw new Error(`Worker closed before ${id}`)
      const response = JSON.parse(line.value)
      if (response.id !== id)
        throw new Error(`Response mismatch: ${response.id} vs ${id}`)
      const wallMs =
        performance.now() - (rows.length === 0 ? started : requestStart)
      const check = truthCheck(response.sentence ?? '', block)
      rows.push({
        blockId: block.id,
        run,
        wallMs,
        ...response,
        truthCheck: check,
      })
      console.log(
        `${candidate} ${id}: ${response.error ?? response.sentence} [${check.pass ? 'pass' : check.reasons.join(', ')}]`,
      )
      // An unavailable device or runtime refusal triggers the brief's STOP, not retries.
      if ((candidate === 'apple' || candidate === 'luna') && response.error)
        throw new Error(response.error)
    }
  }
} catch (error) {
  fatal = String(error)
} finally {
  child.stdin.end()
  if (fatal && !rows.at(-1)?.error && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
}
const exit = await exited
const wallSeconds = (performance.now() - started) / 1000
const cpu = stderr.match(/([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/)
const peak = stderr.match(/(\d+)\s+maximum resident set size/)
const warm = rows
  .slice(1)
  .filter((row) => !row.error)
  .map((row) => row.wallMs)
  .sort((a, b) => a - b)
const percentile = (fraction) =>
  warm.length ? warm[Math.ceil(warm.length * fraction) - 1] : null
const cpuSeconds = cpu ? Number(cpu[2]) + Number(cpu[3]) : null
const report = {
  candidate,
  reportId,
  timestamp: new Date().toISOString(),
  host,
  checkerSha256: createHash('sha256')
    .update(
      readFileSync(
        new URL(
          '../../../electron/backend/block-sentence/block-sentence.pure.ts',
          import.meta.url,
        ),
      ),
    )
    .digest('hex'),
  fixtureSha256: createHash('sha256').update(fixtureText).digest('hex'),
  promptSha256: createHash('sha256').update(prompt).digest('hex'),
  model:
    candidate === 'mlx'
      ? JSON.parse(readFileSync(`${root}model-manifest.json`, 'utf8'))
      : candidate === 'luna'
        ? {
            modelId: LUNA_MODEL_ID,
            effort,
            timeoutMs: LUNA_ONE_SHOT_TIMEOUT_MS,
            providerAccountId: null,
          }
        : 'SystemLanguageModel.default (on-device)',
  methodology:
    'One resident process, 20 blocks in fixed order x 3 runs; greedy, 96 token cap; fresh conversation per block. Cold means process-cold, includes startup/load, excludes download; OS caches/services are not reset; background work on this shared development Mac is uncontrolled. Warm uses remaining successful round trips. RSS/CPU measure worker process, not Apple system inference services or GPU time.',
  loadAverageAtEnd: loadavg(),
  summary: {
    expectedResponses: 60,
    responses: rows.length,
    successfulResponses: rows.filter((row) => !row.error).length,
    coldFirstCallMs: rows[0]?.error ? null : (rows[0]?.wallMs ?? null),
    warmP50Ms: percentile(0.5),
    warmP95Ms: percentile(0.95),
    warmSamples: warm.length,
    peakRssBytes: peak ? Number(peak[1]) : null,
    cpuSeconds,
    wallSeconds,
    averageCpuPercent:
      cpuSeconds === null ? null : (cpuSeconds / wallSeconds) * 100,
    truthPassCount: rows.filter((row) => !row.error && row.truthCheck.pass)
      .length,
    truthPassRate:
      rows.length === 60
        ? rows.filter((row) => !row.error && row.truthCheck.pass).length / 60
        : null,
  },
  fatal,
  exit,
  rows,
}
writeFileSync(
  `${root}reports/${reportId}.json`,
  `${JSON.stringify(report, null, 2)}\n`,
)
writeFileSync(`${root}reports/${reportId}.time.txt`, stderr)
console.log(JSON.stringify(report.summary, null, 2))
if (fatal || exit.code !== 0) process.exitCode = 1
