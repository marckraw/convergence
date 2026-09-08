import type Database from 'better-sqlite3'

/** Additive evidence and its migration marker commit together; history stays unknown. */
export function migrateHarnessEvidence(db: Database.Database): void {
  if (db.prepare("SELECT 1 FROM app_state WHERE key = 'cc2_evidence_v1'").get())
    return
  db.transaction(() => {
    db.exec(`ALTER TABLE session_conversation_items ADD COLUMN agent_run_id TEXT;
      ALTER TABLE session_conversation_items ADD COLUMN task_id TEXT;
      ALTER TABLE session_turns ADD COLUMN result_subtype TEXT;
      ALTER TABLE session_turns ADD COLUMN usage_json TEXT;
      ALTER TABLE session_turns ADD COLUMN cost_usd REAL;
      ALTER TABLE session_turns ADD COLUMN permission_denials_json TEXT;
      ALTER TABLE session_turns ADD COLUMN subagent_stats_json TEXT;`)
    db.exec(`CREATE TABLE session_agent_runs (
      id TEXT NOT NULL, session_id TEXT NOT NULL,
      spawned_by_item_id TEXT NOT NULL, agent_type TEXT, description TEXT, model TEXT,
      status TEXT NOT NULL CHECK(status IN ('running','completed','failed','stopped','unknown')),
      is_backgrounded INTEGER, last_tool_name TEXT, usage_json TEXT, updated_at TEXT,
      depth INTEGER, started_at TEXT NOT NULL, ended_at TEXT, transcript_path TEXT,
      PRIMARY KEY(session_id, id), UNIQUE(session_id, spawned_by_item_id),
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )`)
    db.exec(`CREATE TABLE session_tasks (
      task_id TEXT NOT NULL, session_id TEXT NOT NULL, tool_use_id TEXT,
      task_type TEXT, description TEXT, status TEXT NOT NULL,
      started_at TEXT, ended_at TEXT, output_file TEXT,
      PRIMARY KEY(session_id, task_id),
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )`)
    db.exec(`CREATE TABLE session_harness_events (
      session_id TEXT NOT NULL, sequence INTEGER NOT NULL, type TEXT NOT NULL,
      subtype TEXT, payload_json TEXT NOT NULL CHECK(length(CAST(payload_json AS BLOB)) <= 8192),
      created_at TEXT NOT NULL, PRIMARY KEY(session_id, sequence),
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )`)
    db.prepare(
      "INSERT INTO app_state(key, value) VALUES ('cc2_evidence_v1', '1')",
    ).run()
  })()
}
