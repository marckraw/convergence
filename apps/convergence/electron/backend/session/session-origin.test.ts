import { afterEach, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { closeDatabase, getDatabase, resetDatabase } from '../database/database'
import { SessionService } from './session.service'
import { LocalExecutionHost } from '../provider/execution-host/local-execution-host'
import { ProviderRegistry } from '../provider/provider-registry'

afterEach(() => {
  closeDatabase()
  resetDatabase()
})

it('origin DDL and retained-hop backfill roll back together (mutation: drop backfill or transaction)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run74-origin-'))
  const path = join(dir, 'legacy.sqlite')
  try {
    getDatabase(path)
    closeDatabase()
    resetDatabase()
    const legacy = new Database(path)
    if (
      (legacy.pragma('table_info(sessions)') as { name: string }[]).some(
        (c) => c.name === 'origin_kind',
      )
    )
      legacy.exec('ALTER TABLE sessions DROP COLUMN origin_kind')
    legacy.exec(`INSERT INTO projects(id,name,repository_path,settings) VALUES('p','Project','/repo','{}');
      INSERT INTO sessions(id,project_id,provider_id,name,working_directory) VALUES('spawn','p','codex','Spawn','/repo'),('unknown','p','codex','Unknown','/repo');
      INSERT INTO relay_hops(id,relay_id,crew_id,flow_run_id,source_session_id,spawned_session_id,trigger_status,outcome) VALUES('hop','wire','crew','run','source','spawn','completed','spawned');
      CREATE TRIGGER interrupt_origin BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT,'origin interrupt'); END;`)
    legacy.close()
    expect(() => getDatabase(path)).toThrow('origin interrupt')
    const interrupted = new Database(path)
    expect(
      (interrupted.pragma('table_info(sessions)') as { name: string }[]).map(
        (c) => c.name,
      ),
    ).not.toContain('origin_kind')
    interrupted.exec('DROP TRIGGER interrupt_origin')
    interrupted.close()
    const db = getDatabase(path)
    expect(
      db.prepare('SELECT id,origin_kind FROM sessions ORDER BY id').all(),
    ).toEqual([
      { id: 'spawn', origin_kind: 'spawn' },
      { id: 'unknown', origin_kind: null },
    ])
    closeDatabase()
    resetDatabase()
    expect(() => getDatabase(path)).not.toThrow()
  } finally {
    closeDatabase()
    resetDatabase()
    rmSync(dir, { recursive: true, force: true })
  }
})

it('new births are resident, explicit spawns and their forks retain origin (mutation: fork writes resident)', async () => {
  const db = getDatabase()
  db.prepare(
    "INSERT INTO projects(id,name,repository_path,settings) VALUES('p','Project','/repo','{}')",
  ).run()
  const service = new SessionService(
    db,
    new LocalExecutionHost(new ProviderRegistry()),
  )
  try {
    const input = {
      projectId: 'p',
      workspaceId: null,
      providerId: 'codex',
      model: null,
      effort: null,
      name: 'Horse',
    } as const
    const resident = service.create(input)
    const spawn = service.create({ ...input, origin: 'spawn' })
    expect(resident.originKind).toBe('resident')
    expect(spawn.originKind).toBe('spawn')
    expect(
      service.create({
        ...input,
        parentSessionId: spawn.id,
        forkStrategy: 'full',
      }).originKind,
    ).toBe('spawn')
    db.prepare('UPDATE sessions SET origin_kind=NULL WHERE id=?').run(
      resident.id,
    )
    expect(
      service.create({
        ...input,
        parentSessionId: resident.id,
        forkStrategy: 'full',
      }).originKind,
    ).toBeNull()
  } finally {
    await service.disposeAll()
  }
})
