import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

/**
 * Snapshots the real app's data into the dev sandbox.
 *
 * The database is copied with sqlite's own `.backup`, never a plain file
 * copy: the stable app runs in WAL mode, and copying the .db file alone
 * while it is live can capture a torn state that the sandbox then opens as
 * corruption. `.backup` takes a consistent snapshot even mid-write, which
 * is what lets this run while the stable app stays open.
 */

const realDir = join(homedir(), 'Library', 'Application Support', 'convergence')
const sandboxDir =
  process.env.CONVERGENCE_USER_DATA_DIR ??
  join(homedir(), '.convergence-dev-sandbox')
const force = process.argv.includes('--force')

const realDb = join(realDir, 'convergence.db')
const sandboxDb = join(sandboxDir, 'convergence.db')

if (!existsSync(realDb)) {
  console.error(`no source database at ${realDb} — nothing to seed from`)
  process.exit(1)
}

// A running sandbox holds its database open; reseeding underneath it would
// hand that instance a file that changes out from under its WAL. lsof is the
// honest check on macOS: any process with the file open blocks the seed.
if (existsSync(sandboxDb) && !force) {
  const lsof = spawnSync('lsof', ['-t', sandboxDb], { encoding: 'utf8' })
  const holders = (lsof.stdout ?? '').trim()
  if (holders) {
    console.error(
      `refusing to seed: the sandbox database is open by pid(s) ${holders.split('\n').join(', ')}.`,
    )
    console.error('quit the sandbox app first, or rerun with --force.')
    process.exit(1)
  }
}

mkdirSync(sandboxDir, { recursive: true })

console.log(`seeding sandbox at ${sandboxDir}`)
console.log(
  'backing up database (consistent snapshot, stable app may keep running)...',
)
execFileSync(
  'sqlite3',
  [realDb, `.backup '${sandboxDb.replace(/'/g, "''")}'`],
  {
    stdio: ['ignore', 'inherit', 'inherit'],
  },
)

for (const dir of ['attachments', 'session-outputs']) {
  const source = join(realDir, dir)
  if (!existsSync(source)) continue
  const target = join(sandboxDir, dir)
  console.log(`copying ${dir}...`)
  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, { recursive: true })
}

const count = execFileSync(
  'sqlite3',
  [sandboxDb, 'SELECT count(*) FROM sessions;'],
  { encoding: 'utf8' },
).trim()
console.log(`done: snapshot holds ${count} sessions`)
console.log('start the sandbox with: npm run dev:sandbox')
