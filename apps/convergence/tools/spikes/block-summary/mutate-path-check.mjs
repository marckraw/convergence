import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const sourcePath = `${root}truth-check.pure.ts`
const original = readFileSync(sourcePath, 'utf8')
const needle = "if (unknownPaths.length) reasons.push('invented-path')"
if (!original.includes(needle))
  throw new Error('Mutation anchor changed; review the mutation')
const appRoot = fileURLToPath(new URL('../../../', import.meta.url))
const args = [
  'vitest',
  'run',
  '--config',
  'vitest.pure.config.ts',
  'tools/spikes/block-summary/truth-check.pure.test.ts',
]
const run = () =>
  spawnSync('npx', args, {
    cwd: appRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
let mutated
try {
  writeFileSync(
    sourcePath,
    original.replace(needle, "if (false) reasons.push('invented-path')"),
  )
  mutated = run()
} finally {
  writeFileSync(sourcePath, original)
}
const restored = run()
mkdirSync(`${root}reports`, { recursive: true })
writeFileSync(
  `${root}reports/mutation.txt`,
  [
    'Mutation: skip the unknown path rejection, then restore original source.',
    `Mutated exit: ${mutated.status}`,
    mutated.stdout,
    mutated.stderr,
    `Restored exit: ${restored.status}`,
    restored.stdout,
    restored.stderr,
  ]
    .join('\n')
    .trimEnd() + '\n',
)
if (
  mutated.status !== 1 ||
  !mutated.stderr.includes('rejects an invented path') ||
  restored.status !== 0
) {
  throw new Error(
    'Mutation was not killed by the invented-path test, or restoration failed; see reports/mutation.txt',
  )
}
console.log(
  'Invented-path mutation killed; original source restored; all focused tests pass.',
)
