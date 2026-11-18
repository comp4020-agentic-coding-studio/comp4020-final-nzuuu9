import { expect, inject, it } from "vitest";
import { createRoom, joinRoom, sseReader, submitResponse } from "./test-support.ts";

// Crit 9's promise: live submission progress, a shared reveal once
// everyone's in, and the group rule that an "ask-first" mark anywhere
// keeps an option out of "everyone can accept". Checked against the
// RUNNING app, over its real SSE endpoint.
const baseUrl = inject("baseUrl");

function liveUrl(roomUrl: URL): URL {
  return new URL(roomUrl.pathname.replace(/\/rooms\/([^/]+)$/, "/rooms/$1/live"), baseUrl);
}

it("pushes live progress and a shared reveal, without leaking marks before it", async () => {
  const { roomUrl, organiserCookie: aliceCookie } = await createRoom(
    ["Coastal drive", "Dinner nearby"],
    2,
  );
  const bobCookie = await joinRoom(roomUrl);

  const bobStream = await fetch(liveUrl(roomUrl));
  const bob = sseReader(bobStream);

  // Bob's first event, on connecting, is the room's current state — not
  // yet 1-of-2, since nobody has submitted.
  expect(await bob.next()).toContain("0 of 2 submitted");

  // Alice marks the drive as her first choice and dinner as acceptable.
  const aliceSubmit = await submitResponse(roomUrl, aliceCookie, {
    choice_0: "first",
    choice_1: "acceptable",
  });
  expect(aliceSubmit.status).toBe(303);

  // Within about a second, Bob's open connection reports the count —
  // nothing about what Alice actually marked.
  const afterAlice = await bob.next();
  expect(afterAlice).toContain("1 of 2 submitted");
  expect(afterAlice).not.toContain("Coastal drive");
  expect(afterAlice).not.toContain("Dinner nearby");
  expect(afterAlice).not.toContain("first");
  expect(afterAlice).not.toContain("acceptable");

  // Bob marks the drive "ask me first" and dinner acceptable, then
  // submits. That completes the room, so both sides get the same reveal.
  const bobSubmit = await submitResponse(roomUrl, bobCookie, {
    choice_0: "ask-first",
    choice_1: "acceptable",
  });
  expect(bobSubmit.status).toBe(303);

  const reveal = await bob.next();
  expect(reveal).toContain("Everyone has submitted");
  // Dinner: both marked it acceptable or better -> everyone can accept.
  // The drive: Bob's ask-first keeps it out of that list even though
  // Alice marked it her first choice.
  const acceptSection = reveal.slice(
    reveal.indexOf("Everyone can accept"),
    reveal.indexOf("Needs discussion"),
  );
  const discussSection = reveal.slice(reveal.indexOf("Needs discussion"));
  expect(acceptSection).toContain("Dinner nearby");
  expect(acceptSection).not.toContain("Coastal drive");
  expect(discussSection).toContain("Coastal drive");

  // The reveal never picks a winner for the group.
  expect(reveal).not.toMatch(/winner|decided|chosen/i);

  await bob.close();
});

it("handles a three-person room: one reveal for near-simultaneous submissions, a blocked retry, and a saved result on reopen", async () => {
  const { roomUrl, organiserCookie: aliceCookie } = await createRoom(
    ["Cinema", "Dinner nearby", "Coastal drive"],
    3,
  );
  const bobCookie = await joinRoom(roomUrl);
  const carolCookie = await joinRoom(roomUrl);

  const watcherStream = await fetch(liveUrl(roomUrl));
  const watcher = sseReader(watcherStream);
  expect(await watcher.next()).toContain("0 of 3 submitted");

  // Bob and Carol submit at (as close to) the same time. SQLite's writes
  // on this connection are synchronous, so the two submissions still land
  // as two distinct progress events, not a merged or duplicated one.
  await Promise.all([
    submitResponse(roomUrl, bobCookie, {
      choice_0: "acceptable",
      choice_1: "first",
      choice_2: "ask-first",
    }),
    submitResponse(roomUrl, carolCookie, {
      choice_0: "ask-first",
      choice_1: "acceptable",
      choice_2: "acceptable",
    }),
  ]);

  const seenCounts = new Set([await watcher.next(), await watcher.next()]);
  expect(seenCounts).toEqual(new Set(['<p id="status-text">1 of 3 submitted</p>', '<p id="status-text">2 of 3 submitted</p>']));

  // Alice's submission completes the room: exactly one reveal follows,
  // not one per participant.
  await submitResponse(roomUrl, aliceCookie, {
    choice_0: "acceptable",
    choice_1: "acceptable",
    choice_2: "first",
  });
  const reveal = await watcher.next();
  expect(reveal).toContain("Everyone has submitted");
  // Dinner nearby is the only option nobody marked ask-first.
  expect(reveal.slice(0, reveal.indexOf("Needs discussion"))).toContain("Dinner nearby");

  await watcher.close();

  // A retry after the room is already complete is still rejected.
  const retry = await submitResponse(roomUrl, aliceCookie, {
    choice_0: "first",
    choice_1: "first",
    choice_2: "first",
  });
  expect(retry.status).toBe(400);

  // Reopening the room (simulating closing and reopening the tab) shows
  // the same saved reveal, recomputed from storage rather than from
  // anything held only in the live connection.
  const reopened = await fetch(roomUrl, { headers: { Cookie: bobCookie } });
  const reopenedHtml = await reopened.text();
  expect(reopenedHtml).toContain("Everyone has submitted");
  expect(reopenedHtml).toContain("Dinner nearby");
});
