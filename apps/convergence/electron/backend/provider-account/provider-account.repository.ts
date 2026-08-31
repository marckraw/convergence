import type Database from 'better-sqlite3'
import { mapProviderAccountRow } from './provider-account.pure'
import type {
  CreateProviderAccountInput,
  ProviderAccount,
  ProviderAccountIdentity,
  ProviderAccountRow,
  ProviderAccountStatus,
} from './provider-account.types'

const SELECT_COLUMNS = `
  id, provider_id, label, auth_kind, email, org_id, plan,
  config_dir, credential_dir, execution_host_id, is_default, status,
  last_validated_at, created_at, updated_at
`

/**
 * SQLite-backed store for provider accounts (ADR 0007).
 *
 * Holds **non-secret metadata only**: the credential lives in the OS keychain,
 * addressed by the account's `credentialDir`, and is resolved at execution
 * time. `configDir` and `credentialDir` are immutable after enrolment because
 * both are hashed into keychain slot names — hence a `rename` that touches the
 * label alone, and no path-updating method at all.
 */
export class ProviderAccountRepository {
  private insertStmt: Database.Statement
  private getStmt: Database.Statement
  private listStmt: Database.Statement
  private listByProviderStmt: Database.Statement
  private saveIdentityStmt: Database.Statement
  private setStatusStmt: Database.Statement
  private renameStmt: Database.Statement
  private clearDefaultsStmt: Database.Statement
  private markDefaultStmt: Database.Statement
  private deleteStmt: Database.Statement

  constructor(private db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO provider_accounts (
         id, provider_id, label, auth_kind, email, org_id, plan,
         config_dir, credential_dir, execution_host_id, status, last_validated_at
       ) VALUES (
         @id, @providerId, @label, @authKind, @email, @orgId, @plan,
         @configDir, @credentialDir, @executionHostId, @status, @lastValidatedAt
       )`,
    )
    this.getStmt = db.prepare(
      `SELECT ${SELECT_COLUMNS} FROM provider_accounts WHERE id = ?`,
    )
    this.listStmt = db.prepare(
      `SELECT ${SELECT_COLUMNS} FROM provider_accounts
       ORDER BY provider_id, created_at, id`,
    )
    this.listByProviderStmt = db.prepare(
      `SELECT ${SELECT_COLUMNS} FROM provider_accounts
       WHERE provider_id = ?
       ORDER BY created_at, id`,
    )
    this.saveIdentityStmt = db.prepare(
      `UPDATE provider_accounts
       SET email = @email,
           org_id = @orgId,
           plan = @plan,
           status = @status,
           last_validated_at = @lastValidatedAt,
           updated_at = datetime('now')
       WHERE id = @id`,
    )
    this.setStatusStmt = db.prepare(
      `UPDATE provider_accounts
       SET status = ?, last_validated_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    this.renameStmt = db.prepare(
      `UPDATE provider_accounts
       SET label = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    this.clearDefaultsStmt = db.prepare(
      `UPDATE provider_accounts
       SET is_default = 0, updated_at = datetime('now')
       WHERE provider_id = ? AND execution_host_id = ? AND is_default = 1`,
    )
    this.markDefaultStmt = db.prepare(
      `UPDATE provider_accounts
       SET is_default = 1, updated_at = datetime('now')
       WHERE id = ?`,
    )
    this.deleteStmt = db.prepare('DELETE FROM provider_accounts WHERE id = ?')
  }

  create(input: CreateProviderAccountInput): ProviderAccount {
    this.insertStmt.run({
      id: input.id,
      providerId: input.providerId,
      label: input.label,
      authKind: input.authKind,
      email: input.email ?? null,
      orgId: input.orgId ?? null,
      plan: input.plan ?? null,
      configDir: input.configDir,
      credentialDir: input.credentialDir,
      executionHostId: input.executionHostId,
      status: input.status ?? 'connected',
      lastValidatedAt: input.lastValidatedAt ?? null,
    })

    const created = this.get(input.id)
    if (!created) {
      throw new Error(`Failed to read back provider account ${input.id}`)
    }
    return created
  }

  get(id: string): ProviderAccount | null {
    const row = this.getStmt.get(id) as ProviderAccountRow | undefined
    return row ? mapProviderAccountRow(row) : null
  }

  list(): ProviderAccount[] {
    return (this.listStmt.all() as ProviderAccountRow[]).map(
      mapProviderAccountRow,
    )
  }

  listByProvider(providerId: string): ProviderAccount[] {
    return (
      this.listByProviderStmt.all(providerId) as ProviderAccountRow[]
    ).map(mapProviderAccountRow)
  }

  /** Writes the attested identity block whole, so no stale field can survive. */
  saveIdentity(id: string, identity: ProviderAccountIdentity): void {
    this.saveIdentityStmt.run({ id, ...identity })
  }

  setStatus(
    id: string,
    status: ProviderAccountStatus,
    lastValidatedAt: string | null,
  ): void {
    this.setStatusStmt.run(status, lastValidatedAt, id)
  }

  rename(id: string, label: string): void {
    this.renameStmt.run(label, id)
  }

  /**
   * Makes `id` the preselected account for its own provider and execution host.
   * Transactional because a partial unique index allows only one default per
   * `(provider_id, execution_host_id)` pair.
   */
  setDefault(id: string): void {
    const account = this.get(id)
    if (!account) return

    this.db.transaction(() => {
      this.clearDefaultsStmt.run(account.providerId, account.executionHostId)
      this.markDefaultStmt.run(id)
    })()
  }

  remove(id: string): void {
    this.deleteStmt.run(id)
  }
}
