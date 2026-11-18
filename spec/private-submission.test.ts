import { expect, inject, it } from "vitest";

// Crit 8's promise: a private, one-shot submission per participant. This
// checks it against the RUNNING app, the same way invariants.test.ts does.
const baseUrl = inject("baseUrl");

// node:http's Set-Cookie can be a single header or several; fetch always
// gives one combined string, so split on the comma that starts the next
// cookie-pair (a plain "," inside an attribute like Expires doesn't match
// this because it's never followed by "name=value;").
function firstCookiePair(setCookieHeader: string): string {
  return setCookieHeader.split(/,(?=\s*[\w.-]+=)/)[0].split(";")[0];
}

async function createRoom(): Promise<{ roomUrl: URL; organiserCookie: string }> {
  // Two options share the field name "option", so the body is built with
  // repeated .append calls rather than the URLSearchParams object form
  // (which would keep only the last one).
  const body = new URLSearchParams();
  body.append("question", "Cinema or dinner?");
  body.append("option", "Cinema");
  body.append("option", "Dinner nearby");
  body.append("expectedParticipants", "2");

  const create = await fetch(new URL("/rooms", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  expect(create.status).toBe(303);
  const location = create.headers.get("location");
  const setCookie = create.headers.get("set-cookie");
  expect(location, "room creation should redirect to the new room").toBeTruthy();
  expect(setCookie, "room creation should set the organiser's participant cookie").toBeTruthy();

  return {
    roomUrl: new URL(location!, baseUrl),
    organiserCookie: firstCookiePair(setCookie!),
  };
}

it("keeps a submission private, persistent, and non-repeatable", async () => {
  const { roomUrl, organiserCookie } = await createRoom();
  const responsesUrl = new URL(`${roomUrl.pathname}/responses`, roomUrl);

  // The organiser submits a response with no favourite (valid) and one
  // "ask-first" mark.
  const submit = await fetch(responsesUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: organiserCookie },
    body: new URLSearchParams({ choice_0: "acceptable", choice_1: "ask-first" }),
  });
  expect(submit.status).toBe(303);

  // Retrying the exact same submission (e.g. a double-click, or returning
  // to a stale form) must be rejected, not recorded a second time.
  const retry = await fetch(responsesUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: organiserCookie },
    body: new URLSearchParams({ choice_0: "first", choice_1: "acceptable" }),
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
