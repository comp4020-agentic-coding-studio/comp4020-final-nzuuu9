import { inject } from "vitest";

const baseUrl = inject("baseUrl");

// node:http's Set-Cookie can be a single header or several; fetch always
// gives one combined string, so split on the comma that starts the next
// cookie-pair (a plain "," inside an attribute like Expires doesn't match
// this because it's never followed by "name=value;").
export function firstCookiePair(setCookieHeader: string): string {
  return setCookieHeader.split(/,(?=\s*[\w.-]+=)/)[0].split(";")[0];
}

export async function createRoom(
  options: string[],
  expectedParticipants: number,
): Promise<{ roomUrl: URL; organiserCookie: string }> {
  // Options share the field name "option", so the body is built with
  // repeated .append calls rather than the URLSearchParams object form
  // (which would keep only the last one).
  const body = new URLSearchParams();
  body.append("question", "Cinema, dinner, or drive?");
  for (const option of options) body.append("option", option);
  body.append("expectedParticipants", String(expectedParticipants));

  const create = await fetch(new URL("/rooms", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const location = create.headers.get("location");
  const setCookie = create.headers.get("set-cookie");
  if (create.status !== 303 || !location || !setCookie) {
    throw new Error(`room creation failed: status ${create.status}`);
  }

  return {
    roomUrl: new URL(location, baseUrl),
    organiserCookie: firstCookiePair(setCookie),
  };
}

// A second (or third) participant opening the room link for the first
// time: no cookie sent, a fresh one comes back.
export async function joinRoom(roomUrl: URL): Promise<string> {
  const res = await fetch(roomUrl);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("joining a room should set a participant cookie");
  return firstCookiePair(setCookie);
}

export async function submitResponse(
  roomUrl: URL,
  cookie: string,
  marks: Record<string, string>,
): Promise<Response> {
  const responsesUrl = new URL(`${roomUrl.pathname}/responses`, roomUrl);
  return fetch(responsesUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: new URLSearchParams(marks),
  });
}

// Reads one SSE event at a time off a /rooms/:id/live response, decoding
// the "data: " lines back into the HTML fragment the server sent.
export function sseReader(res: Response): { next(): Promise<string>; close(): Promise<void> } {
  if (!res.body) throw new Error("SSE response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  return {
    // The stream's body is locked to this reader, so closing it has to go
    // through the reader too — calling res.body.cancel() directly throws.
    async close(): Promise<void> {
      await reader.cancel();
    },
    async next(): Promise<string> {
      while (true) {
        const boundary = buf.indexOf("\n\n");
        if (boundary !== -1) {
          const chunk = buf.slice(0, boundary);
          buf = buf.slice(boundary + 2);
          return chunk
            .split("\n")
            .map((line) => line.replace(/^data: ?/, ""))
            .join("\n");
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("SSE stream ended before another event arrived");
        buf += decoder.decode(value, { stream: true });
      }
    },
  };
}
