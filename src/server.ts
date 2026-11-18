import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createRoom,
  ensureParticipant,
  getOwnResponses,
  getRoom,
  hasSubmitted,
  isOrganiser,
  submitResponse,
  ValidationError,
  type Choice,
} from "./rooms.ts";
import { escapeHtml, page } from "./html.ts";

const README = readFileSync("README.md", "utf8");

// --- tiny cookie helpers -------------------------------------------------

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Identity is a per-room participant id, carried in a cookie scoped to that
// room's path. That's what makes a second browser (no cookie) "another
// person": it gets a fresh id and never sees the first one's private marks.
function participantCookieName(roomId: string): string {
  return `participant_${roomId}`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function parseForm(body: string): Record<string, string[]> {
  const params = new URLSearchParams(body);
  const out: Record<string, string[]> = {};
  for (const key of params.keys()) {
    if (!out[key]) out[key] = params.getAll(key);
  }
  return out;
}

// --- views -----------------------------------------------------------------

function homePage(): string {
  return page(
    "bigger than 2",
    `
      <h1>bigger than 2</h1>
      <p>Create a round: a question, 2–3 options, and how many people will answer.</p>
      <form method="post" action="/rooms">
        <label>Question<br /><input name="question" required maxlength="200" /></label><br /><br />
        <label>Option 1<br /><input name="option" required maxlength="100" /></label><br />
        <label>Option 2<br /><input name="option" required maxlength="100" /></label><br />
        <label>Option 3 (optional)<br /><input name="option" maxlength="100" /></label><br /><br />
        <label>Expected participants (including you)<br />
          <select name="expectedParticipants">
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label><br /><br />
        <button type="submit">Create room</button>
      </form>
      <p><a href="/readme/">About this app</a></p>
    `,
  );
}

function optionRow(index: number, label: string, current: Choice | undefined, disabled: boolean): string {
  const name = `choice_${index}`;
  const opts: { value: Choice; label: string }[] = [
    { value: "first", label: "First choice" },
    { value: "acceptable", label: "Acceptable" },
    { value: "ask-first", label: "Ask me first" },
  ];
  const radios = opts
    .map(
      (o) => `
        <label>
          <input type="radio" name="${name}" value="${o.value}" ${current === o.value ? "checked" : ""} ${disabled ? "disabled" : ""} required />
          ${o.label}
        </label>`,
    )
    .join("");
  return `<fieldset><legend>${escapeHtml(label)}</legend>${radios}</fieldset>`;
}

function roomPage(opts: {
  roomId: string;
  question: string;
  options: string[];
  expectedParticipants: number;
  isOrganiser: boolean;
  submitted: boolean;
  ownMarks: Record<number, Choice>;
  error?: string;
  shareUrl: string;
}): string {
  const { roomId, question, options, expectedParticipants, submitted, ownMarks, error, shareUrl } = opts;

  const rows = options.map((label, i) => optionRow(i, label, ownMarks[i], submitted)).join("\n");

  const form = submitted
    ? `<p><strong>Your response is recorded.</strong> You marked:</p>
       <ul>${options.map((label, i) => `<li>${escapeHtml(label)}: ${escapeHtml(ownMarks[i] ?? "")}</li>`).join("")}</ul>
       <p>Live progress and the group reveal arrive in the next milestone.</p>`
    : `<form method="post" action="/rooms/${roomId}/responses">
         ${rows}
         <p><em>No favourite is valid — you can mark every option "Acceptable" or "Ask me first".</em></p>
         <button type="submit">Submit my response</button>
       </form>`;

  return page(
    question,
    `
      <p><a href="/">&larr; new round</a></p>
      <h1>${escapeHtml(question)}</h1>
      <p>Expected participants: ${expectedParticipants}</p>
      <p>Share this link with the group: <code>${escapeHtml(shareUrl)}</code></p>
      ${error ? `<p role="alert" style="color: #b00;">${escapeHtml(error)}</p>` : ""}
      ${form}
    `,
  );
}

function notFoundPage(): string {
  return page("Not found", `<h1>Not found</h1><p>This room doesn't exist.</p><p><a href="/">Start a new round</a></p>`);
}

// --- request handling --------------------------------------------------

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Fly terminates TLS and proxies plain HTTP to the app (fly.toml), so the
  // app itself never sees https; the share link still needs to say https in
  // production, so it's inferred from the host rather than the connection.
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const origin = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? `http://${host}` : `https://${host}`;

  if (req.method === "GET" && url.pathname === "/") {
    send(res, 200, homePage());
    return;
  }

  if (req.method === "GET" && url.pathname === "/readme/") {
    send(
      res,
      200,
      page("About", `<pre>${escapeHtml(README)}</pre>`),
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/style.css") {
    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
    res.end(
      "body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5}" +
        "fieldset{margin-bottom:1rem}label{display:block;margin:.25rem 0}",
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/rooms") {
    const body = parseForm(await readBody(req));
    try {
      const { room, organiserId } = createRoom({
        question: body.question?.[0] ?? "",
        options: body.option ?? [],
        expectedParticipants: Number(body.expectedParticipants?.[0]),
      });
      const cookie = `${participantCookieName(room.id)}=${organiserId}; Path=/rooms/${room.id}; HttpOnly; SameSite=Lax`;
      send(res, 303, "", { Location: `/rooms/${room.id}`, "Set-Cookie": cookie });
    } catch (err) {
      if (err instanceof ValidationError) {
        send(res, 400, page("Error", `<p role="alert">${escapeHtml(err.message)}</p><p><a href="/">Back</a></p>`));
        return;
      }
      throw err;
    }
    return;
  }

  const roomMatch = url.pathname.match(/^\/rooms\/([^/]+)$/);
  if (req.method === "GET" && roomMatch) {
    const roomId = roomMatch[1];
    const room = getRoom(roomId);
    if (!room) {
      send(res, 404, notFoundPage());
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieName = participantCookieName(roomId);
    let participantId = cookies[cookieName];
    const headers: Record<string, string> = {};

    if (!participantId) {
      participantId = randomUUID();
      ensureParticipant(roomId, participantId);
      headers["Set-Cookie"] = `${cookieName}=${participantId}; Path=/rooms/${roomId}; HttpOnly; SameSite=Lax`;
    } else {
      // idempotent: a returning participant (organiser or not) is already a
      // row, and re-inserting is a no-op (rooms.ts: ON CONFLICT DO NOTHING)
      ensureParticipant(roomId, participantId);
    }

    send(
      res,
      200,
      roomPage({
        roomId,
        question: room.question,
        options: room.options,
        expectedParticipants: room.expectedParticipants,
        isOrganiser: isOrganiser(roomId, participantId),
        submitted: hasSubmitted(roomId, participantId),
        ownMarks: getOwnResponses(roomId, participantId),
        shareUrl: `${origin}/rooms/${roomId}`,
      }),
      headers,
    );
    return;
  }

  const responseMatch = url.pathname.match(/^\/rooms\/([^/]+)\/responses$/);
  if (req.method === "POST" && responseMatch) {
    const roomId = responseMatch[1];
    const room = getRoom(roomId);
    if (!room) {
      send(res, 404, notFoundPage());
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const participantId = cookies[participantCookieName(roomId)];
    if (!participantId) {
      // No cookie means this browser never opened the room page to get an
      // identity; there's nothing to attribute the submission to.
      send(res, 400, page("Error", `<p role="alert">Open the room link first.</p>`));
      return;
    }

    const body = parseForm(await readBody(req));
    const marks: Record<number, Choice> = {};
    for (let i = 0; i < room.options.length; i++) {
      const value = body[`choice_${i}`]?.[0];
      if (value === "first" || value === "acceptable" || value === "ask-first") marks[i] = value;
    }

    try {
      submitResponse(roomId, participantId, marks);
      send(res, 303, "", { Location: `/rooms/${roomId}` });
    } catch (err) {
      if (err instanceof ValidationError) {
        send(
          res,
          400,
          roomPage({
            roomId,
            question: room.question,
            options: room.options,
            expectedParticipants: room.expectedParticipants,
            isOrganiser: isOrganiser(roomId, participantId),
            submitted: hasSubmitted(roomId, participantId),
            ownMarks: marks,
            error: err.message,
            shareUrl: `${origin}/rooms/${roomId}`,
          }),
        );
        return;
      }
      throw err;
    }
    return;
  }

  send(res, 404, notFoundPage());
}

const port = Number(process.env.PORT ?? 8080);
createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    send(res, 500, page("Error", "<p>Something went wrong.</p>"));
  });
}).listen(port, "0.0.0.0", () => {
  console.log(`listening on 0.0.0.0:${port}`);
});
