# bigger than 2

## The problem

In a group of three, one person often ends up making the call — not because
the others don't care, but because "anything is fine" never distinguishes a
genuine preference from a boundary someone would actually want respected.
Saying nothing, or going along with whatever's suggested first, reads the
same as agreeing to it.

## The rule this app enforces

An organiser poses a question with 2-3 options and names how many people
will answer. Each participant privately marks every option as their first
choice, acceptable, or ask me first — no option can be left unmarked, and
having no favourite is a valid answer. Silence and "ask me first" never
count as agreement; only an explicit "first choice" or "acceptable" mark
does. The group still makes the final call — the app reveals what's already
agreed and what still needs a conversation, but it never decides anything
itself.

## What's built so far

**Crit 8** — create a round and get a shareable room link; submit a private
response once per person, per room (retries don't double-count and don't let
you change your mind after submitting); a room and your own response persist
across closing the tab, reopening the browser, and a server restart; a
second browser opening the same link gets its own identity and never sees
anyone else's marks.

**Crit 9** — everyone watching a room sees how many people have submitted,
live, with no reload — updated over a single Server-Sent Events connection
per open tab. Nothing an open tab receives before everyone's submitted is
more than a count: no option, no choice, no partial tally. Once everyone has
submitted, every open tab gets the same reveal at once: which options
everyone marked first-choice-or-acceptable ("everyone can accept"), and which
have at least one "ask me first" ("needs discussion"). The reveal is derived
fresh from the stored responses, not cached anywhere — reopening a completed
room later recomputes and shows the same result. The app still never picks
a winner.

**Crit 10** — who a participant is, what they can see or change, and why, is
written down below and enforced on the server rather than left to the
client. The server also logs who joined, who submitted, and when a room's
reveal happened, using a label that identifies a participant without being
their session credential or disclosing anything they marked.

## Who a participant is, and what they can do (Crit 10)

A participant is identified by a random id in a cookie scoped to that one
room (`/rooms/<roomId>`) — not an account, not a name typed in, because the
app doesn't need to know who someone is, only that it's the same browser
coming back. The first browser to open a room's link becomes its organiser;
every later distinct browser becomes a participant. Both are recorded, but
**organiser is informational only** — it grants no extra power over the
room or anyone else's data. There's deliberately nothing in this app an
organiser can do that a participant can't: no editing, deleting, or closing
someone else's response, because the group's decision rule (an "ask me
first" from anyone keeps an option out of "everyone can accept") only works
if nobody — organiser included — can touch what someone else submitted.

What the server actually enforces, independent of what any page renders:

- **Room size is a hard cap, not a suggestion.** A room admits exactly the
  number of distinct participants its organiser named when creating it; a
  browser arriving after that cap is reached is refused (HTTP 403), not
  quietly let in as an extra voice in a "2-person" decision. Enforced in
  `ensureParticipant` (`src/rooms.ts`), at the point a new participant would
  otherwise be created — not in the UI, since the room link itself is the
  only thing standing between "the people this question was for" and
  anyone else it reaches.
- **Before everyone's submitted, a participant sees only their own marks**
  — never another participant's options or partial tally, only a plain
  count of how many people have submitted so far (this was already true
  from Crit 9; it's restated here as a permission rule because it's exactly
  the kind of thing that's easy to accidentally break while adding a
  feature, and is now covered by a regression test).
- **A submission is one person's, once.** Nobody — not the organiser, not
  the participant themselves on a retry — can submit again for the same
  participant in the same room, or alter a response after it's recorded.
- **After reveal, everyone sees the same two lists** (accepted / needs
  discussion), derived the same way for every participant; nobody gets a
  different, more detailed, or earlier view of the result.

## What the server logs

Every join, submission, and reveal is logged server-side (stdout, which
Fly's own log storage keeps independently of the running machine, so the
log outlives a redeploy or the crit it was recorded for). Each line carries
a short label derived from the participant's id (a truncated hash, not the
id itself and never the session cookie), so two participants in the same
room can be told apart across log lines without the log being able to
impersonate either of them if it leaked. Nobody's actual marks are ever
logged — only that an event of a given kind happened, for which room, for
which labelled participant, and when.

## What's deliberately not built yet

- No accounts — a participant is whoever's browser first opened the room
  link, identified by a cookie scoped to that room.
- No editing a submitted response. The design rule is that an answer is
  either an explicit mark or it doesn't count; letting someone revise after
  seeing others' answers would undermine the private-submission step this
  app exists to protect.
- No handling yet for a browser that loses its cookie (private mode,
  cleared storage) — that person currently looks like a brand-new
  participant, and if the room is already full, they're refused entry
  entirely rather than recognised as someone who was already in it.
