import type { ServerResponse } from "node:http";

// Live progress/reveal is push-only, in-memory fan-out over SSE: nothing
// here is a source of truth (getRoomStatus in rooms.ts, backed by SQLite,
// is), so losing these subscriber lists on a restart is harmless — every
// client reconnects and gets the room page's current state on load. That
// also means a redeploy, or a second server instance, needs no shared
// pub/sub: each process only has to broadcast to the clients connected to
// IT, which is all SSE gives a client to connect to.
const subscribers = new Map<string, Set<ServerResponse>>();

export function subscribe(roomId: string, res: ServerResponse): void {
  let set = subscribers.get(roomId);
  if (!set) {
    set = new Set();
    subscribers.set(roomId, set);
  }
  set.add(res);
  res.on("close", () => {
    set!.delete(res);
    if (set!.size === 0) subscribers.delete(roomId);
  });
}

// SSE's payload is one or more "data: " lines ended by a blank line; a
// multi-line HTML fragment needs every line prefixed, or only the first
// line survives.
export function writeEvent(res: ServerResponse, html: string): void {
  const payload = html
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");
  res.write(`${payload}\n\n`);
}

// Sends pre-rendered HTML (statusHtml's output in server.ts), not raw
// data, so the only thing that ever crosses an open connection is the
// already-reduced submission count or accept/discuss split — never a
// participant's individual marks.
export function broadcast(roomId: string, html: string): void {
  const set = subscribers.get(roomId);
  if (!set) return;
  for (const res of set) writeEvent(res, html);
}
