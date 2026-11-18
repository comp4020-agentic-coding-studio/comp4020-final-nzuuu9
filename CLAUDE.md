# Harness for "bigger than 2"

## The rule the app enforces (see README.md)

Silence and "ask me first" never count as agreement. Only an explicit
"first choice" or "acceptable" mark does. Any change to submission logic
must preserve this: a response is accepted only when every option has an
explicit mark, and "ask-first"/unset must never be treated as acceptance
anywhere — not in validation, not in any future reveal/tally logic.

The group makes the final decision. The app surfaces agreement and
disagreement; it must never auto-pick a winning option on anyone's behalf.

## Live updates (Crit 9)

Before everyone in a room has submitted, anything pushed to an open tab is
a submission count, nothing else — never another participant's options,
marks, or a partial tally. Only the fully-reduced reveal (accepted/discuss
lists, computed in `getRoomStatus`) may ever cross an open connection once
the room is complete. If you add new live data, run it through the same
reduction rule: a client never receives more than what `getRoomStatus`
already decided is safe to show.

The reveal is never stored — `getRoomStatus` recomputes it from `responses`
every time, so reopening a completed room and a live push always agree.
Don't cache it.

## Stack

No build step, no framework, no runtime npm dependencies. Node's built-ins
only: `node:http`, `node:sqlite`, `node:crypto`. TypeScript runs directly
via Node's native type stripping (works because the pinned Node version is
24.21.0 in both `mise.toml` and the `Dockerfile` — don't let those drift
apart). Keep using plain `node:sqlite` rather than adding an ORM or ABI-
compiled driver; the Fly image is Alpine and native bindings are a redeploy
risk the course setup doesn't need.

Persistence is a single SQLite file at `/data/app.db` (the Fly volume). Any
new table needs a reason tied to an actual feature, not speculative shape.

Live updates use Server-Sent Events (`/rooms/:id/live`), held in an
in-memory per-process subscriber list (`src/live.ts`). That list is not a
source of truth and doesn't need to survive a restart: every client
reconnects and the room page's own render (backed by SQLite) is always
correct on load. Don't add a second live-update mechanism (WebSockets,
polling) alongside it without a reason SSE can't cover.

## Multi-user identity

A participant is a random id in a cookie scoped to `/rooms/<roomId>`. Don't
widen the cookie's path or add a global identity — the isolation guarantee
(a second browser never sees another participant's marks) depends on the
cookie being per-room.

## Testing

`spec/invariants.test.ts` is the course's fixed contract — never delete or
weaken it. Add new checks under `spec/*.test.ts` for promises this app
actually makes (e.g. idempotent submission, cross-browser isolation);
don't write checks for behaviour that isn't implemented yet.
