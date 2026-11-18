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

## What's built so far (Crit 8)

- Create a round and get a shareable room link.
- Submit a private response once per person, per room; retries don't
  double-count and don't let you change your mind after submitting.
- A room and your own response persist across closing the tab, reopening
  the browser, and a server restart.
- A second browser opening the same link gets its own identity and never
  sees anyone else's marks.

Live submission progress and the group reveal (what's unanimously accepted,
what needs discussion) are the next milestone, not this one.

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
