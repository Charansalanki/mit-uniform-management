import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const benchmarkDbPath = path.join(__dirname, 'data', 'benchmark_100k.db');
if (fs.existsSync(benchmarkDbPath)) {
  fs.unlinkSync(benchmarkDbPath);
}

console.log('===============================================================');
console.log('   AMAZON-STYLE 100,000 RECORD DATABASE PERFORMANCE BENCHMARK  ');
console.log('===============================================================');
console.log(`Creating benchmark database at: ${benchmarkDbPath}`);

const db = new DatabaseSync(benchmarkDbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -128000; -- 128MB cache

  CREATE TABLE campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE registrations (
    id TEXT PRIMARY KEY,
    registration_id TEXT UNIQUE NOT NULL,
    campaign_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    usn TEXT NOT NULL,
    phone TEXT NOT NULL,
    college_email TEXT,
    department TEXT NOT NULL,
    semester INTEGER NOT NULL,
    section TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    shirt_size TEXT NOT NULL,
    trouser_size TEXT NOT NULL,
    submission_status TEXT NOT NULL,
    production_status TEXT NOT NULL,
    distribution_status TEXT NOT NULL,
    collection_room TEXT,
    collection_date TEXT,
    collection_instructions TEXT,
    submitted_at TEXT NOT NULL,
    editable_until TEXT NOT NULL,
    collected_at TEXT,
    collected_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(campaign_id, usn)
  );

  CREATE TABLE uniform_orders (
    id TEXT PRIMARY KEY,
    student_id TEXT UNIQUE NOT NULL,
    uniform_items TEXT NOT NULL,
    production_status TEXT NOT NULL,
    distribution_status TEXT NOT NULL,
    collection_room TEXT,
    collection_date TEXT,
    collection_instructions TEXT,
    distribution_batch_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- High-performance indexes matching production schema
  CREATE INDEX idx_reg_usn ON registrations(usn);
  CREATE INDEX idx_reg_id ON registrations(registration_id);
  CREATE INDEX idx_reg_dept_sem_sec ON registrations(department, semester, section);
  CREATE INDEX idx_reg_submitted_at ON registrations(submitted_at DESC);
  CREATE INDEX idx_reg_prod_dist_status ON registrations(production_status, distribution_status);
  CREATE INDEX idx_orders_student ON uniform_orders(student_id);

  CREATE VIRTUAL TABLE registrations_fts USING fts5(
    registration_id,
    usn,
    full_name,
    phone,
    content='registrations',
    content_rowid='rowid'
  );

  CREATE TRIGGER registrations_ai AFTER INSERT ON registrations BEGIN
    INSERT INTO registrations_fts(rowid, registration_id, usn, full_name, phone)
    VALUES (new.rowid, new.registration_id, new.usn, new.full_name, new.phone);
  END;
`);

const campId = crypto.randomUUID();
db.prepare('INSERT INTO campaigns VALUES (?, ?, ?, 1, ?)').run(campId, 'Uniform Distribution 2026', '2026-27', new Date().toISOString());

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Shaurya', 'Ananya', 'Diya', 'Aadhya', 'Pari', 'Saanvi', 'Anushka', 'Khushi', 'Prisha', 'Tanvi'];
const LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Iyer', 'Rao', 'Reddy', 'Nair', 'Kulkarni', 'Deshmukh', 'Gowda', 'Shetty', 'Bhat', 'Joshi', 'Hegde', 'Kumar', 'Singh', 'Mishra', 'Gupta', 'Prasad', 'Das'];
const DEPTS = ['CSE', 'ISE', 'ECE', 'AIML', 'MECH', 'CIVIL', 'EEE'];
const SECTIONS = ['A', 'B', 'C', 'D'];
const SHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const TROUSER_SIZES = ['28', '30', '32', '34', '36', '38'];
const PROD_STATUSES = ['pending', 'in_production', 'ready'];
const DIST_STATUSES = ['pending', 'ready', 'collected'];

const TOTAL_RECORDS = 100000;
const BATCH_SIZE = 10000;

console.log(`\nGenerating & inserting ${TOTAL_RECORDS.toLocaleString()} synthetic student records...`);
const startIngest = performance.now();

const insertReg = db.prepare(`
  INSERT INTO registrations (
    id, registration_id, campaign_id, full_name, gender, usn, phone, college_email,
    department, semester, section, academic_year, shirt_size, trouser_size,
    submission_status, production_status, distribution_status,
    collection_room, collection_date, collection_instructions,
    submitted_at, editable_until, collected_at, collected_by, created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?, ?
  )
`);

const baseDate = Date.now() - (30 * 24 * 3600 * 1000);

for (let batch = 0; batch < TOTAL_RECORDS / BATCH_SIZE; batch++) {
  db.exec('BEGIN TRANSACTION');
  for (let i = 0; i < BATCH_SIZE; i++) {
    const idx = batch * BATCH_SIZE + i + 1;
    const studentId = `std-${idx}`;
    const usnNum = String(idx).padStart(6, '0');
    const usn = `4MH22CS${usnNum}`;
    const regId = `${usn}-${idx}`;
    const fName = FIRST_NAMES[idx % FIRST_NAMES.length];
    const lName = LAST_NAMES[(idx * 7) % LAST_NAMES.length];
    const fullName = `${fName} ${lName}`;
    const gender = idx % 2 === 0 ? 'Female' : 'Male';
    const dept = DEPTS[idx % DEPTS.length];
    const sem = (idx % 8) + 1;
    const sec = SECTIONS[idx % SECTIONS.length];
    const phone = `9${String(100000000 + (idx % 899999999))}`;
    const shirt = SHIRT_SIZES[idx % SHIRT_SIZES.length];
    const trouser = TROUSER_SIZES[idx % TROUSER_SIZES.length];
    const prod = PROD_STATUSES[idx % PROD_STATUSES.length];
    const dist = prod === 'ready' ? (idx % 2 === 0 ? 'collected' : 'ready') : 'pending';
    const subAt = new Date(baseDate + (idx * 25000)).toISOString();
    const editUntil = new Date(baseDate + (idx * 25000) + 86400000).toISOString();
    const collectedAt = dist === 'collected' ? subAt : null;

    insertReg.run(
      studentId, regId, campId, fullName, gender, usn, phone, `${usn.toLowerCase()}@mitmysore.ac.in`,
      dept, sem, sec, '2026-27', shirt, trouser,
      'submitted', prod, dist,
      dist === 'ready' ? 'Room 204' : null, null, null,
      subAt, editUntil, collectedAt, dist === 'collected' ? 'Admin Desk' : null, subAt, subAt
    );
  }
  db.exec('COMMIT');
  process.stdout.write(`  Inserted ${(batch + 1) * BATCH_SIZE} / ${TOTAL_RECORDS} records...\r`);
}

const ingestTime = (performance.now() - startIngest).toFixed(2);
console.log(`\n✅ Ingestion complete: 100,000 records inserted in ${ingestTime} ms (${(TOTAL_RECORDS / (ingestTime / 1000)).toFixed(0)} records/sec)\n`);

// Helper to compute latency stats
function calculateStats(times) {
  times.sort((a, b) => a - b);
  const min = times[0];
  const max = times[times.length - 1];
  const avg = times.reduce((s, v) => s + v, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.50)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  return { min, max, avg, p50, p95, p99 };
}

// ─── BENCHMARK 1: Exact Indexed USN & Registration ID Lookup ───
console.log('Running Benchmark 1: Exact Indexed Lookup (USN & Reg ID) — Target p95 < 200ms...');
const lookupStmt = db.prepare('SELECT * FROM registrations WHERE usn = ?');
const lookupTimes = [];
const NUM_QUERIES = 2000;

for (let i = 0; i < NUM_QUERIES; i++) {
  const randIdx = Math.floor(1 + Math.random() * (TOTAL_RECORDS - 1));
  const usn = `4MH22CS${String(randIdx).padStart(6, '0')}`;
  const t0 = performance.now();
  const row = lookupStmt.get(usn);
  const t1 = performance.now();
  lookupTimes.push(t1 - t0);
}

const b1 = calculateStats(lookupTimes);
console.log(`  Min: ${b1.min.toFixed(3)}ms | Avg: ${b1.avg.toFixed(3)}ms | p50: ${b1.p50.toFixed(3)}ms | p95: ${b1.p95.toFixed(3)}ms | p99: ${b1.p99.toFixed(3)}ms`);
console.log(`  -> RESULT: ${b1.p95 < 200 ? 'PASSED ✅' : 'FAILED ❌'} (Target: p95 < 200ms, Measured: ${b1.p95.toFixed(3)}ms)\n`);

// ─── BENCHMARK 2: Multi-Attribute Compound Filter Query ─────────
console.log('Running Benchmark 2: Multi-Attribute Compound Filtering (Dept + Sem + Sec + Status) — Target p95 < 350ms...');
const multiStmt = db.prepare(`
  SELECT id, registration_id, full_name, usn, department, semester, section, shirt_size, trouser_size, production_status
  FROM registrations
  WHERE department = ? AND semester = ? AND section = ? AND production_status = ?
  LIMIT 25 OFFSET 0
`);
const multiTimes = [];

for (let i = 0; i < 500; i++) {
  const dept = DEPTS[i % DEPTS.length];
  const sem = (i % 8) + 1;
  const sec = SECTIONS[i % SECTIONS.length];
  const prod = PROD_STATUSES[i % PROD_STATUSES.length];
  const t0 = performance.now();
  const rows = multiStmt.all(dept, sem, sec, prod);
  const t1 = performance.now();
  multiTimes.push(t1 - t0);
}

const b2 = calculateStats(multiTimes);
console.log(`  Min: ${b2.min.toFixed(3)}ms | Avg: ${b2.avg.toFixed(3)}ms | p50: ${b2.p50.toFixed(3)}ms | p95: ${b2.p95.toFixed(3)}ms | p99: ${b2.p99.toFixed(3)}ms`);
console.log(`  -> RESULT: ${b2.p95 < 350 ? 'PASSED ✅' : 'FAILED ❌'} (Target: p95 < 350ms, Measured: ${b2.p95.toFixed(3)}ms)\n`);

// ─── BENCHMARK 3: Amazon-Style Full-Text / Prefix Search (FTS5) ─
console.log('Running Benchmark 3: Fast Full-Text & Prefix Search (FTS5) — Target p95 < 350ms...');
const ftsStmt = db.prepare(`
  SELECT r.id, r.registration_id, r.full_name, r.usn, r.phone, r.department
  FROM registrations r
  JOIN registrations_fts fts ON r.rowid = fts.rowid
  WHERE registrations_fts MATCH ?
  LIMIT 25
`);
const ftsTimes = [];

const SEARCH_TERMS = ['Aarav*', 'Sharma*', 'Patel*', 'Ananya*', '91000*', 'Kumar*'];

for (let i = 0; i < 500; i++) {
  const term = SEARCH_TERMS[i % SEARCH_TERMS.length];
  const t0 = performance.now();
  const rows = ftsStmt.all(term);
  const t1 = performance.now();
  ftsTimes.push(t1 - t0);
}

const b3 = calculateStats(ftsTimes);
console.log(`  Min: ${b3.min.toFixed(3)}ms | Avg: ${b3.avg.toFixed(3)}ms | p50: ${b3.p50.toFixed(3)}ms | p95: ${b3.p95.toFixed(3)}ms | p99: ${b3.p99.toFixed(3)}ms`);
console.log(`  -> RESULT: ${b3.p95 < 350 ? 'PASSED ✅' : 'FAILED ❌'} (Target: p95 < 350ms, Measured: ${b3.p95.toFixed(3)}ms)\n`);

// ─── BENCHMARK 4: Server-Side Scalable Pagination with Stable Tie-Breaker
console.log('Running Benchmark 4: Scalable Server-Side Pagination (Page 100, Size 25) — Target p95 < 200ms...');
const pageStmt = db.prepare(`
  SELECT r.id, r.registration_id, r.full_name, r.usn, r.department, r.submitted_at
  FROM registrations r
  ORDER BY r.submitted_at DESC, r.id ASC
  LIMIT ? OFFSET ?
`);
const pageTimes = [];

for (let i = 0; i < 500; i++) {
  const offset = (i % 200) * 25;
  const t0 = performance.now();
  const rows = pageStmt.all(25, offset);
  const t1 = performance.now();
  pageTimes.push(t1 - t0);
}

const b4 = calculateStats(pageTimes);
console.log(`  Min: ${b4.min.toFixed(3)}ms | Avg: ${b4.avg.toFixed(3)}ms | p50: ${b4.p50.toFixed(3)}ms | p95: ${b4.p95.toFixed(3)}ms | p99: ${b4.p99.toFixed(3)}ms`);
console.log(`  -> RESULT: ${b4.p95 < 200 ? 'PASSED ✅' : 'FAILED ❌'} (Target: p95 < 200ms, Measured: ${b4.p95.toFixed(3)}ms)\n`);

console.log('===============================================================');
console.log('                  BENCHMARK SUMMARY REPORT                     ');
console.log('===============================================================');
console.log(`Total Records: 100,000`);
console.log(`B1: Indexed ID Lookup:         p95 = ${b1.p95.toFixed(3)} ms  (Target < 200ms)  ${b1.p95 < 200 ? '✅' : '❌'}`);
console.log(`B2: Multi-Attribute Query:     p95 = ${b2.p95.toFixed(3)} ms  (Target < 350ms)  ${b2.p95 < 350 ? '✅' : '❌'}`);
console.log(`B3: Amazon-Style Search (FTS): p95 = ${b3.p95.toFixed(3)} ms  (Target < 350ms)  ${b3.p95 < 350 ? '✅' : '❌'}`);
console.log(`B4: Scalable Pagination:       p95 = ${b4.p95.toFixed(3)} ms  (Target < 200ms)  ${b4.p95 < 200 ? '✅' : '❌'}`);
console.log('===============================================================');

// Clean up benchmark database file
try {
  db.close();
  fs.unlinkSync(benchmarkDbPath);
  console.log('Benchmark database cleaned up.');
} catch {}

