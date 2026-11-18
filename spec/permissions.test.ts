import { expect, it } from "vitest";
import { createRoom, joinRoom, submitResponse } from "./test-support.ts";

// Crit 10's promise: what each participant may see and change is checked
// on the server, not just left to the client. The size cap was previously
// unenforced — a third browser could join a "2-person" room — so that's
// the gap this file covers; the rest (private-until-reveal, one-shot
// submission, shared post-reveal result) already has coverage from
// Crit 8/9 and isn't repeated here.

it("admits exactly the room's expected number of participants, and refuses a latecomer", async () => {
  const { roomUrl } = await createRoom(["Cinema", "Dinner nearby"], 2);

  // The organiser already took the first of 2 seats; one more browser
  // fills the room.
  await joinRoom(roomUrl);

  // A third, distinct browser arriving after the room is full must be
  // refused outright — not silently let in as an unexpected third voice
  // in what was named as a 2-person decision.
  const thirdBrowser = await fetch(roomUrl);
  expect(thirdBrowser.status).toBe(403);
  expect(thirdBrowser.headers.get("set-cookie")).toBeFalsy();
});

it("lets a participant who already joined keep returning once the room is otherwise full", async () => {
  const { roomUrl, organiserCookie } = await createRoom(["Cinema", "Dinner nearby"], 2);
  await joinRoom(roomUrl);

  // The cap is on distinct participants, not on requests: the organiser,
  // already seated, can still reopen the room.
  const revisit = await fetch(roomUrl, { headers: { Cookie: organiserCookie } });
  expect(revisit.status).toBe(200);
});

it("keeps a rejected latecomer unable to submit, since they were never seated", async () => {
  const { roomUrl } = await createRoom(["Cinema", "Dinner nearby"], 2);
  await joinRoom(roomUrl);

  // A submission needs the room's own cookie; a browser the room refused
  // never received one, so it has nothing valid to submit with.
  const submit = await submitResponse(roomUrl, "", { choice_0: "acceptable", choice_1: "acceptable" });
  expect(submit.status).toBe(400);
});
