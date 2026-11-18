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

## What's deliberately not built yet

- No accounts — a participant is whoever's browser first opened the room
  link, identified by a cookie scoped to that room.
- No editing a submitted response. The design rule is that an answer is
  either an explicit mark or it doesn't count; letting someone revise after
  seeing others' answers would undermine the private-submission step this
  app exists to protect.
- No handling yet for a browser that loses its cookie (private mode,
  cleared storage) — that person currently looks like a brand-new
  participant.
- No distinction yet between the organiser and other participants beyond
  who's recorded as having created the room, and no log of who submitted
  what and when — that's Crit 10.
