import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// /data is the Fly volume (fly.toml); it's the only thing that survives a
// restart or redeploy, so the db file lives there. DB_PATH lets tests and
// local runs point elsewhere.
const DB_PATH = process.env.DB_PATH ?? "/data/app.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    options TEXT NOT NULL, -- JSON array of strings, 2 or 3 entries
    expected_participants INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS participants (
    room_id TEXT NOT NULL REFERENCES rooms(id),
    participant_id TEXT NOT NULL,
    is_organiser INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (room_id, participant_id)
  );

  -- One row per (room, participant, option): the participant's mark for that
  -- option. Overwritten on resubmission within the same browser/session, but
  -- once submissions.locked_at is set the room no longer accepts changes.
  CREATE TABLE IF NOT EXISTS responses (
    room_id TEXT NOT NULL REFERENCES rooms(id),
    participant_id TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    choice TEXT NOT NULL CHECK (choice IN ('first', 'acceptable', 'ask-first')),
    PRIMARY KEY (room_id, participant_id, option_index)
  );

  -- Presence of a row here means that participant has submitted. A retry
  -- (same participant re-POSTing) must not create a second submission; it's
  -- keyed by (room_id, participant_id) so it can only ever exist once.
  CREATE TABLE IF NOT EXISTS submissions (
    room_id TEXT NOT NULL REFERENCES rooms(id),
    participant_id TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    PRIMARY KEY (room_id, participant_id)
  );
`);
