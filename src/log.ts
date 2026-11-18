import { createHash } from "node:crypto";

// A short, stable, non-reversible label for a participant — never the
// cookie value itself (that's the actual bearer credential; logging it
// would let anyone who reads the logs impersonate that participant) and
// never anything about their marks. Same participant always gets the same
// label within a room, so two people can be told apart across log lines
// without the label being their session token.
function label(participantId: string): string {
  return createHash("sha256").update(participantId).digest("hex").slice(0, 8);
}

function roomLabel(roomId: string): string {
  return roomId.slice(0, 8);
}

// Fly captures stdout as the app's logs (`flyctl logs`), and they outlive
// any one crit or redeploy because Fly keeps them independently of the
// running machine. One line per event, grep-able by room or participant
// label.
function event(kind: string, roomId: string, participantId: string, extra?: string): void {
  const line = `room=${roomLabel(roomId)} participant=${label(participantId)} event=${kind}`;
  console.log(extra ? `${line} ${extra}` : line);
}

export function logJoined(roomId: string, participantId: string, isOrganiser: boolean): void {
  event("joined", roomId, participantId, isOrganiser ? "role=organiser" : "role=participant");
}

export function logSubmitted(roomId: string, participantId: string): void {
  event("submitted", roomId, participantId);
}

export function logRevealed(roomId: string, submitted: number, expected: number): void {
  console.log(`room=${roomLabel(roomId)} event=revealed submitted=${submitted} expected=${expected}`);
}

export function logRejected(roomId: string, participantId: string, reason: string): void {
  event("rejected", roomId, participantId, `reason=${JSON.stringify(reason)}`);
}
