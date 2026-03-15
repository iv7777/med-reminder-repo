-- Med Reminder - Database Schema
-- Run: npx wrangler d1 execute med-reminder --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  pin_hash     TEXT NOT NULL,
  role         TEXT NOT NULL CHECK(role IN ('admin','caregiver','patient')),
  display_name TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  notes      TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_patient_access (
  user_id      INTEGER REFERENCES users(id),
  patient_id   INTEGER REFERENCES patients(id),
  access_level TEXT NOT NULL CHECK(access_level IN ('full','view')),
  PRIMARY KEY (user_id, patient_id)
);

CREATE TABLE IF NOT EXISTS time_blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER REFERENCES patients(id),
  label       TEXT NOT NULL,
  time_hhmm   TEXT NOT NULL,
  context     TEXT,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS medications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id   INTEGER REFERENCES time_blocks(id),
  name       TEXT NOT NULL,
  dose       TEXT NOT NULL,
  note       TEXT,
  sort_order INTEGER DEFAULT 0,
  active     INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS dose_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  medication_id  INTEGER REFERENCES medications(id),
  patient_id     INTEGER REFERENCES patients(id),
  scheduled_date TEXT NOT NULL,
  taken          INTEGER DEFAULT 0,
  taken_at       TEXT,
  taken_by       INTEGER REFERENCES users(id),
  note           TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dose_logs_patient_date
  ON dose_logs(patient_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_medications_block
  ON medications(block_id, active);

CREATE INDEX IF NOT EXISTS idx_time_blocks_patient
  ON time_blocks(patient_id, sort_order);
