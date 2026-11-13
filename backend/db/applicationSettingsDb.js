const path = require('path');
const fs = require('fs');

// Point this to your existing SQLite database instance or file path
// If your project already exports `db` from './database' or '../config/db', import it here.
let rawDb = null;
try {
  rawDb = require('../config/sqliteNode24Engine');
} catch (_) {
  try {
    rawDb = require('../config/db');
  } catch (__) {
    try {
      rawDb = require('./database');
    } catch (___) {
      rawDb = null;
    }
  }
}

const DB_FILE_PATH =
  process.env.SQLITE_DB_PATH ||
  process.env.DB_PATH ||
  path.join(__dirname, '..', 'data', 'uniform_management.sqlite');

/**
 * Initializes or wraps the existing SQLite connection safely across:
 * 1. better-sqlite3
 * 2. Node 24 built-in `node:sqlite` (DatabaseSync)
 * 3. callback-based `sqlite3`
 */
function createSqliteAdapter(existingDb) {
  let dbInstance = existingDb?.db || existingDb;

  if (typeof dbInstance === 'function' && typeof dbInstance.prepare !== 'function') {
    try {
      dbInstance = dbInstance();
    } catch (_) {}
  }

  // If no existing instance was auto-detected, open the existing database file
  if (!dbInstance || (typeof dbInstance.prepare !== 'function' && typeof dbInstance.run !== 'function')) {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      // Fallback to Node 24 native built-in SQLite first
      const { DatabaseSync } = require('node:sqlite');
      dbInstance = new DatabaseSync(DB_FILE_PATH);
    } catch (_) {
      try {
        // Try better-sqlite3 if installed
        const BetterSqlite3 = require('better-sqlite3');
        dbInstance = new BetterSqlite3(DB_FILE_PATH);
      } catch (__) {
        try {
          // Try callback-based sqlite3 if installed
          const sqlite3 = require('sqlite3');
          dbInstance = new sqlite3.Database(DB_FILE_PATH);
        } catch (___) {
          throw new Error('No SQLite driver available (node:sqlite, better-sqlite3, or sqlite3).');
        }
      }
    }
  }

  // Case A: Callback-based `sqlite3` driver (has .serialize and .all)
  const isAsyncSqlite3 =
    typeof dbInstance.serialize === 'function' &&
    typeof dbInstance.all === 'function' &&
    typeof dbInstance.prepare === 'function' &&
    dbInstance.constructor.name === 'Database';

  if (isAsyncSqlite3) {
    const run = (sql, params = []) =>
      new Promise((resolve, reject) => {
        dbInstance.run(sql, params, function (err) {
          if (err) return reject(err);
          resolve({ changes: this.changes, lastID: this.lastID });
        });
      });

    const get = (sql, params = []) =>
      new Promise((resolve, reject) => {
        dbInstance.get(sql, params, (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        });
      });

    const all = (sql, params = []) =>
      new Promise((resolve, reject) => {
        dbInstance.all(sql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });

    const exec = (sql) =>
      new Promise((resolve, reject) => {
        dbInstance.exec(sql, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

    return { run, get, all, exec, driver: 'sqlite3-async', raw: dbInstance };
  }

  // Case B: Synchronous `better-sqlite3` or Node 24 `node:sqlite` (`DatabaseSync`)
  return {
    run: async (sql, params = []) => {
      const stmt = dbInstance.prepare(sql);
      return Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
    },
    get: async (sql, params = []) => {
      const stmt = dbInstance.prepare(sql);
      const row = Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
      return row || null;
    },
    all: async (sql, params = []) => {
      const stmt = dbInstance.prepare(sql);
      return (Array.isArray(params) ? stmt.all(...params) : stmt.all(params)) || [];
    },
    exec: async (sql) => {
      return dbInstance.exec(sql);
    },
    driver: 'sqlite-sync',
    raw: dbInstance
  };
}

const db = createSqliteAdapter(rawDb);
let initialized = false;

/**
 * Ensures WAL concurrency mode, busy_timeout, and the single persistent row exist.
 * Never drops or alters existing student, USN, registration, or payment tables.
 */
async function ensureSettingsInitialized() {
  if (initialized) return;

  // Prevent SQLITE_BUSY timeouts during concurrent student reads & admin writes
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);

  // Create persistent settings table if not present (singleton id = 1)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS application_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      ug_application_open INTEGER NOT NULL DEFAULT 1,
      pg_application_open INTEGER NOT NULL DEFAULT 1,
      closed_video_url TEXT NOT NULL DEFAULT '/assets/videos/application-closed.mp4',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed singleton row id=1 ONLY if it doesn't already exist (preserves existing values on restart)
  await db.run(`
    INSERT INTO application_settings (id, ug_application_open, pg_application_open, closed_video_url, updated_at)
    VALUES (1, 1, 1, '/assets/videos/application-closed.mp4', datetime('now'))
    ON CONFLICT(id) DO NOTHING;
  `);

  initialized = true;
}

/**
 * Fetches current UG and PG status from SQLite.
 */
async function getSettingsFromDb() {
  await ensureSettingsInitialized();
  const row = await db.get(
    `SELECT id, ug_application_open, pg_application_open, closed_video_url, updated_at
     FROM application_settings
     WHERE id = 1`
  );

  const ugOpen = Number(row?.ug_application_open) === 1;
  const pgOpen = Number(row?.pg_application_open) === 1;

  return {
    ugApplicationOpen: ugOpen,
    pgApplicationOpen: pgOpen,
    bothClosed: !ugOpen && !pgOpen,
    closedVideoUrl: row?.closed_video_url || '/assets/videos/application-closed.mp4',
    updatedAt: row?.updated_at
      ? new Date(row.updated_at.replace(' ', 'T') + 'Z').toISOString()
      : new Date().toISOString(),
  };
}

/**
 * Atomically updates ONLY `ug_application_open` in SQLite without modifying `pg_application_open`.
 */
async function setUgStatusInDb(isOpen) {
  await ensureSettingsInitialized();
  const intVal = isOpen ? 1 : 0;
  const nowIso = new Date().toISOString();

  await db.run(
    `UPDATE application_settings
     SET ug_application_open = ?,
         updated_at = ?
     WHERE id = 1`,
    [intVal, nowIso]
  );

  return getSettingsFromDb();
}

/**
 * Atomically updates ONLY `pg_application_open` in SQLite without modifying `ug_application_open`.
 */
async function setPgStatusInDb(isOpen) {
  await ensureSettingsInitialized();
  const intVal = isOpen ? 1 : 0;
  const nowIso = new Date().toISOString();

  await db.run(
    `UPDATE application_settings
     SET pg_application_open = ?,
         updated_at = ?
     WHERE id = 1`,
    [intVal, nowIso]
  );

  return getSettingsFromDb();
}

module.exports = {
  db,
  ensureSettingsInitialized,
  getSettingsFromDb,
  setUgStatusInDb,
  setPgStatusInDb,
};
