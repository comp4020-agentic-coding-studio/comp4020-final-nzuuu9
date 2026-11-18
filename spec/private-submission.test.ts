import { expect, it } from "vitest";
import { createRoom, submitResponse } from "./test-support.ts";

// Crit 8's promise: a private, one-shot submission per participant. This
// checks it against the RUNNING app, the same way invariants.test.ts does.

it("keeps a submission private, persistent, and non-repeatable", async () => {
  const { roomUrl, organiserCookie } = await createRoom(["Cinema", "Dinner nearby"], 2);

  // The organiser submits a response with no favourite (valid) and one
  // "ask-first" mark.
  const submit = await submitResponse(roomUrl, organiserCookie, {
    choice_0: "acceptable",
    choice_1: "ask-first",
  });
  expect(submit.status).toBe(303);

  // Retrying the exact same submission (e.g. a double-click, or returning
  // to a stale form) must be rejected, not recorded a second time.
  const retry = await submitResponse(roomUrl, organiserCookie, {
    choice_0: "first",
    choice_1: "acceptable",
  });
  expect(retry.status).toBe(400);

  // Revisiting with the same cookie (closing and reopening the tab) still
  // shows the original recorded response, untouched by the rejected retry.
  const revisit = await fetch(roomUrl, { headers: { Cookie: organiserCookie } });
  const revisitHtml = await revisit.text();
  expect(revisitHtml).toContain("Your response is recorded");
  expect(revisitHtml).toContain("Cinema: acceptable");
  expect(revisitHtml).toContain("Dinner nearby: ask-first");

  // A second browser — no cookie at all — opening the same room link must
  // get its own identity, and must not see the organiser's private marks.
  const secondBrowser = await fetch(roomUrl);
  const secondHtml = await secondBrowser.text();
  expect(secondHtml).not.toContain("Your response is recorded");
  expect(secondHtml).not.toContain("Cinema: acceptable");
  expect(secondBrowser.headers.get("set-cookie")).toBeTruthy();
});
