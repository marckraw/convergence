import { spawnSync } from 'node:child_process'

const result = spawnSync('npm', ['rebuild', 'better-sqlite3'], {
  stdio: 'ignore',
  shell: true,
})

process.exit(result.status ?? 0)
