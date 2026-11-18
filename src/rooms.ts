import { randomUUID } from "node:crypto";
import { db } from "./db.ts";

export type Choice = "first" | "acceptable" | "ask-first";

export interface Room {
  id: string;
  question: string;
  options: string[];
  expectedParticipants: number;
  createdAt: string;
}

export interface NewRoomInput {
  question: string;
  options: string[];
  expectedParticipants: number;
}

export function createRoom(input: NewRoomInput): { room: Room; organiserId: string } {
  const question = input.question.trim();
  if (!question) throw new ValidationError("question is required");

  const options = input.options.map((o) => o.trim()).filter((o) => o.length > 0);
  if (options.length < 2 || options.length > 3) {
    throw new ValidationError("there must be 2 or 3 options");
  }

  if (!Number.isInteger(input.expectedParticipants) || input.expectedParticipants < 2 || input.expectedParticipants > 3) {
    throw new ValidationError("expected participants must be 2 or 3");
  }

  const id = randomUUID();
  const organiserId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO rooms (id, question, options, expected_participants, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, question, JSON.stringify(options), input.expectedParticipants, now);

  db.prepare(
    "INSERT INTO participants (room_id, participant_id, is_organiser, joined_at) VALUES (?, ?, 1, ?)",
  ).run(id, organiserId, now);

  return {
    room: { id, question, options, expectedParticipants: input.expectedParticipants, createdAt: now },
    organiserId,
  };
}

export function getRoom(roomId: string): Room | undefined {
  const row = db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId) as
    | { id: string; question: string; options: string; expected_participants: number; created_at: string }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    question: row.question,
    options: JSON.parse(row.options),
    expectedParticipants: row.expected_participants,
    createdAt: row.created_at,
  };
}

// A participant is created the first time their browser is seen in this
// room (see server.ts, which holds the per-room participant cookie), not
// here — joining and submitting are separate concerns.
export function ensureParticipant(roomId: string, participantId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO participants (room_id, participant_id, is_organiser, joined_at) VALUES (?, ?, 0, ?) " +
      "ON CONFLICT (room_id, participant_id) DO NOTHING",
  ).run(roomId, participantId, now);
}

export function isOrganiser(roomId: string, participantId: string): boolean {
  const row = db
    .prepare("SELECT is_organiser FROM participants WHERE room_id = ? AND participant_id = ?")
    .get(roomId, participantId) as { is_organiser: number } | undefined;
  return row?.is_organiser === 1;
}

export function hasSubmitted(roomId: string, participantId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM submissions WHERE room_id = ? AND participant_id = ?")
    .get(roomId, participantId);
  return row !== undefined;
}

export function getOwnResponses(roomId: string, participantId: string): Record<number, Choice> {
  const rows = db
    .prepare("SELECT option_index, choice FROM responses WHERE room_id = ? AND participant_id = ?")
    .all(roomId, participantId) as { option_index: number; choice: Choice }[];
  const out: Record<number, Choice> = {};
  for (const row of rows) out[row.option_index] = row.choice;
  return out;
}

export class ValidationError extends Error {}

// Submission is all-or-nothing: every option needs an explicit mark, and a
// participant who already submitted can't submit again (the design rule
// that silence never counts as agreement means a partial resubmit can't be
// allowed to quietly complete it either).
export function submitResponse(
  roomId: string,
  participantId: string,
  marks: Record<number, Choice>,
): void {
  const room = getRoom(roomId);
  if (!room) throw new ValidationError("room not found");

  if (hasSubmitted(roomId, participantId)) {
    throw new ValidationError("you have already submitted a response for this room");
  }

  for (let i = 0; i < room.options.length; i++) {
    const mark = marks[i];
    if (mark !== "first" && mark !== "acceptable" && mark !== "ask-first") {
      throw new ValidationError(`option ${i} needs an explicit choice`);
    }
  }

  const firstCount = Object.values(marks).filter((m) => m === "first").length;
  if (firstCount > 1) {
    throw new ValidationError("at most one option can be your first choice");
  }

  const now = new Date().toISOString();

  // Transaction: either every mark is written plus the submission lock, or
  // none of it is — a crash mid-write must not leave a half-recorded
  // response that getOwnResponses would show as complete.
  db.exec("BEGIN");
  try {
    const insert = db.prepare(
      "INSERT INTO responses (room_id, participant_id, option_index, choice) VALUES (?, ?, ?, ?)",
    );
    for (let i = 0; i < room.options.length; i++) {
      insert.run(roomId, participantId, i, marks[i]);
    }
    db.prepare(
      "INSERT INTO submissions (room_id, participant_id, submitted_at) VALUES (?, ?, ?)",
    ).run(roomId, participantId, now);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
