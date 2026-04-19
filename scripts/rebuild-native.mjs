import { spawnSync } from 'node:child_process'
import process from 'node:process'

const result = spawnSync('npm', ['rebuild', 'better-sqlite3', 'node-pty'], {
  stdio: 'ignore',
  shell: true,
})

process.exit(result.status ?? 0)
