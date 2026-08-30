import type Database from 'better-sqlite3'
import {
  serializeSessionWorkAddress,
  UNKNOWN_WORK_ADDRESS,
  type SessionWorkAddress,
} from '../../../src/shared/lib/work-address.pure'

/**
 * The place a test's remote session states (MAR-2689).
 *
 * A remote session is born with a concrete place or not at all, so every suite
 * that starts one on a daemon has to say where it works — the same sentence the
 * strip says before send.
 *
 * Repository mode, naming the repository those suites' legacy workspace
 * resolvers already answer with, so the bytes that reach
 * `POST /v0/execution/sessions` are exactly what they were before the column
 * existed. A fixture that changed the wire would quietly rewrite what every one
 * of those tests is asserting.
 */
export const TEST_REMOTE_WORK_ADDRESS: SessionWorkAddress = {
  mode: 'repository',
  repository: 'git@github.com:acme/repo.git',
  // No branch written down, so no `branchName` key reaches the wire and the
  // bytes stay exactly what they were before C2 (MAR-2694).
  branchName: null,
  label: 'acme/repo',
}

/**
 * Turns a row into one from before the work-address column existed (MAR-2689).
 *
 * Written straight to the table, and that is the point: `create` refuses to
 * mint a remote session with no concrete place, so the only rows that can carry
 * `unknown` are the ones the migration backfilled. A suite that needs the
 * legacy derivation -- the session project's origin, resolved at start -- has
 * to build the row the migration would have left, not ask the service for one
 * it will not make.
 */
export function makeSessionPreEraRemote(
  db: Database.Database,
  sessionId: string,
  executionHostId: string,
): void {
  db.prepare(
    'UPDATE sessions SET execution_host = ?, work_address = ? WHERE id = ?',
  ).run(
    executionHostId,
    serializeSessionWorkAddress(UNKNOWN_WORK_ADDRESS),
    sessionId,
  )
}
