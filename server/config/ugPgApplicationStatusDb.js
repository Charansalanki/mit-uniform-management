/**
 * INDEPENDENT UG & PG APPLICATION CONTROL TABLE ("sqlite-node24")
 * Stores UG and PG states independently and preserves them across restarts.
 */

export function initUgPgControlTables(db) {
  if (!db) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS application_category_controls (
      id TEXT PRIMARY KEY DEFAULT 'MIT_UG_PG_MASTER_CONTROL',
      ug_open INTEGER NOT NULL DEFAULT 1,
      pg_open INTEGER NOT NULL DEFAULT 1,
      ug_closed_message TEXT NOT NULL DEFAULT 'Undergraduate (B.E. / B.Tech.) uniform registration and new payment submissions are currently closed.',
      pg_closed_message TEXT NOT NULL DEFAULT 'Postgraduate (MBA / MCA / M.Tech.) uniform registration and new payment submissions are currently closed.',
      video_url TEXT NOT NULL DEFAULT '/assets/video/application-closed.mp4',
      ug_updated_by TEXT NOT NULL DEFAULT 'System Initializer',
      ug_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      pg_updated_by TEXT NOT NULL DEFAULT 'System Initializer',
      pg_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT NOT NULL DEFAULT 'System Initializer',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS application_control_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL, -- 'UG', 'PG', or 'BOTH'
      previous_ug_open INTEGER NOT NULL,
      new_ug_open INTEGER NOT NULL,
      previous_pg_open INTEGER NOT NULL,
      new_pg_open INTEGER NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed singleton row ONLY if it does not exist yet (Never overwrites existing admin settings on restart)
  const existing = db
    .prepare(`SELECT id FROM application_category_controls WHERE id = 'MIT_UG_PG_MASTER_CONTROL'`)
    .get();

  if (!existing) {
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO application_category_controls (
        id, ug_open, pg_open, ug_updated_at, pg_updated_at, updated_at
      ) VALUES ('MIT_UG_PG_MASTER_CONTROL', 1, 1, ?, ?, ?)
    `).run(nowIso, nowIso, nowIso);
  }
}

export function getUgPgControlState(db) {
  initUgPgControlTables(db);
  const row = db
    .prepare(`SELECT * FROM application_category_controls WHERE id = 'MIT_UG_PG_MASTER_CONTROL'`)
    .get();

  const history = db
    .prepare(`SELECT * FROM application_control_audit_logs ORDER BY id DESC LIMIT 30`)
    .all();

  const ugOpen = Boolean(row ? row.ug_open === 1 : true);
  const pgOpen = Boolean(row ? row.pg_open === 1 : true);

  return {
    ugApplicationOpen: ugOpen,
    pgApplicationOpen: pgOpen,
    ugStatusLabel: ugOpen ? 'ON' : 'OFF',
    pgStatusLabel: pgOpen ? 'ON' : 'OFF',
    // Computed overall state for compatibility
    bothClosed: !ugOpen && !pgOpen,
    bothOpen: ugOpen && pgOpen,
    isApplicationOpen: ugOpen || pgOpen,
    ugClosedMessage: row ? row.ug_closed_message : 'Undergraduate (B.E. / B.Tech.) uniform registration is currently closed.',
    pgClosedMessage: row ? row.pg_closed_message : 'Postgraduate (MBA / MCA / M.Tech.) uniform registration is currently closed.',
    videoUrl: row ? row.video_url : '/assets/video/application-closed.mp4',
    ugUpdatedBy: row ? row.ug_updated_by : 'System Initializer',
    ugUpdatedAt: row ? row.ug_updated_at : null,
    pgUpdatedBy: row ? row.pg_updated_by : 'System Initializer',
    pgUpdatedAt: row ? row.pg_updated_at : null,
    lastUpdatedBy: row ? row.updated_by : 'System Initializer',
    lastUpdatedAt: row ? row.updated_at : null,
    history: (history || []).map((h) => ({
      id: h.id,
      category: h.category,
      previousUgOpen: Boolean(h.previous_ug_open === 1),
      newUgOpen: Boolean(h.new_ug_open === 1),
      previousPgOpen: Boolean(h.previous_pg_open === 1),
      newPgOpen: Boolean(h.new_pg_open === 1),
      changedBy: h.changed_by,
      changedAt: h.changed_at
    }))
  };
}

export default {
  initUgPgControlTables,
  getUgPgControlState
};

