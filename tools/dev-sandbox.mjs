import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')

// The sandbox must never share userData with the stable app: on boot each
// instance marks running local sessions as failed, so two instances on one
// database shoot each other's live sessions.
const sandboxDir =
  process.env.CONVERGENCE_USER_DATA_DIR ??
  join(homedir(), '.convergence-dev-sandbox')

console.log(`sandbox userData: ${sandboxDir}`)
console.log('the stable app can keep running — this instance is isolated')
console.log('seed or refresh its data first with: npm run dev:seed')

const child = spawn('npm', ['run', 'dev'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CONVERGENCE_USER_DATA_DIR: sandboxDir },
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
