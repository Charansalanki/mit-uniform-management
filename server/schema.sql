CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO campaigns (name, active)
SELECT 'Uniform Distribution 2026', TRUE
WHERE NOT EXISTS (SELECT 1 FROM campaigns);

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'Male' CHECK (gender IN ('Male', 'Female')),
  usn TEXT NOT NULL,
  department TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
  section TEXT NOT NULL CHECK (section IN ('A','B','C','D','E','F','G')),
  phone TEXT NOT NULL,
  shirt_size TEXT NOT NULL,
  trouser_size TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edit_deadline TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  collected_at TIMESTAMPTZ,
  collected_by TEXT,
  UNIQUE (campaign_id, usn)
);

CREATE TABLE IF NOT EXISTS distribution_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  department TEXT NOT NULL,
  semester INTEGER NOT NULL,
  section TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','scheduled','completed','postponed','cancelled')),
  distribution_date DATE,
  start_time TIME,
  end_time TIME,
  building TEXT,
  room TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, department, semester, section)
);
