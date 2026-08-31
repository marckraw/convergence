import { existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')

const pathsToRemove = [
  join(repoRoot, 'out'),
  join(repoRoot, 'node_modules', '.vite'),
]

for (const target of pathsToRemove) {
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
    console.log(`removed ${target}`)
  }
}

console.log(
  'preserved app data under ~/Library/Application Support/convergence',
)
console.log('starting fresh dev build...')

const child = spawn('npm', ['run', 'dev'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
